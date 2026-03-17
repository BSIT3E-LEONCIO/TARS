import { useEffect, useRef, useState } from "react";

type Props = {
  onSend: (text: string, files?: File[]) => void;
  disabled?: boolean;
  onUserSpeechStart?: () => void;
  latestAssistantText?: string;
  assistantSpeaking?: boolean;
  speechLang?: string;
};

type RecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: {
        transcript: string;
      };
    };
  };
};

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const InputBox = ({
  onSend,
  disabled = false,
  onUserSpeechStart,
  latestAssistantText = "",
  assistantSpeaking = false,
  speechLang = "auto",
}: Props) => {
  const [text, setText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [micMode, setMicMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const shouldContinueRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const bargeInCooldownRef = useRef(0);
  const recognitionStartedAtRef = useRef(0);
  const assistantSpeechAtRef = useRef(0);
  const lastSentRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const pendingFinalRef = useRef("");
  const finalSendTimerRef = useRef<number | null>(null);
  const onSendRef = useRef(onSend);
  const onUserSpeechStartRef = useRef(onUserSpeechStart);
  const latestAssistantTextRef = useRef(latestAssistantText);
  const assistantSpeakingRef = useRef(assistantSpeaking);
  const speechLangRef = useRef(speechLang);

  const tokenize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2);

  const normalizeForMatch = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isLikelyEcho = (candidate: string, assistantText: string) => {
    const normalizedCandidate = normalizeForMatch(candidate);
    const normalizedAssistant = normalizeForMatch(assistantText);

    if (
      normalizedCandidate.length >= 10 &&
      normalizedAssistant.length >= 10 &&
      normalizedAssistant.includes(normalizedCandidate)
    ) {
      return true;
    }

    const inputTokens = tokenize(candidate);
    const assistantTokens = tokenize(assistantText);

    if (inputTokens.length < 4 || assistantTokens.length < 4) {
      return false;
    }

    const assistantSet = new Set(assistantTokens);
    const overlap = inputTokens.filter((token) => assistantSet.has(token)).length;
    const ratio = overlap / inputTokens.length;
    return ratio >= 0.55;
  };

  const applySpeechCorrections = (raw: string) => {
    return raw
      .replace(/\b(tar|tarrs|tares|tar's|tars)\b/gi, "TARS")
      .replace(/\bhey\s+(tar|tarrs|tares|tar's|tars)\b/gi, "hey TARS")
      .replace(/\s+/g, " ")
      .trim();
  };

  const flushPendingFinal = () => {
    const chunk = pendingFinalRef.current.trim();
    if (!chunk) {
      return;
    }

    const now = Date.now();
    const prev = lastSentRef.current.text.toLowerCase();
    const next = chunk.toLowerCase();

    const isDuplicate = next === prev && now - lastSentRef.current.at < 3500;
    const isIncrementalRepeat =
      now - lastSentRef.current.at < 4500 &&
      (next.startsWith(prev) || prev.startsWith(next)) &&
      (next.length >= 6 || prev.length >= 6);

    if (!isDuplicate && !isIncrementalRepeat) {
      setText("");
      setLiveTranscript(chunk);
      onSendRef.current(chunk, selectedFiles);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      lastSentRef.current = { text: chunk, at: now };
    }

    pendingFinalRef.current = "";
  };

  const handleSend = () => {
    if ((text.trim() !== "" || selectedFiles.length > 0) && !disabled) {
      onSend(text.trim(), selectedFiles);
      setText("");
      setLiveTranscript("");
      setSelectedFiles([]);
      setAttachmentError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    if (!incoming.length) {
      return;
    }

    const deduped = incoming.filter(
      (file) => !selectedFiles.some((current) => current.name === file.name && current.size === file.size),
    );

    const nextFiles = [...selectedFiles, ...deduped].slice(0, 6);
    setSelectedFiles(nextFiles);

    if (incoming.length !== deduped.length || selectedFiles.length + deduped.length > 6) {
      setAttachmentError("Some attachments were skipped due to duplicates or file-count limit (max 6).");
    } else {
      setAttachmentError(null);
    }

    event.target.value = "";
  };

  const removeSelectedFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const resolveSpeechLang = () => {
    if (speechLangRef.current === "auto") {
      return window.navigator.language || "en-US";
    }
    return speechLangRef.current;
  };

  const createRecognition = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    };

    const RecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!RecognitionCtor) {
      const isDesktop = typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron");
      setVoiceError(
        isDesktop
          ? "Speech recognition engine unavailable in desktop runtime. Restart app after granting microphone permission."
          : "Speech input is not supported in this browser.",
      );
      return null;
    }

    const recognition = new RecognitionCtor();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = resolveSpeechLang();
    recognition.onstart = () => {
      recognitionStartedAtRef.current = Date.now();
      setListening(true);
      setVoiceError(null);
    };

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) {
        return;
      }

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const chunk = applySpeechCorrections(result[0]?.transcript ?? "");
        if (!chunk) {
          continue;
        }

        const looksEcho = isLikelyEcho(chunk, latestAssistantTextRef.current);
        const shouldSuppressEcho =
          looksEcho &&
          (assistantSpeakingRef.current || Date.now() - assistantSpeechAtRef.current < 1800);

        if (shouldSuppressEcho) {
          continue;
        }

        const wordCount = chunk.split(/\s+/).filter(Boolean).length;

        if (assistantSpeakingRef.current && !looksEcho && wordCount >= 2) {
          const now = Date.now();
          if (now - bargeInCooldownRef.current > 600) {
            bargeInCooldownRef.current = now;
            onUserSpeechStartRef.current?.();
          }
        }

        if (chunk.length > 1 && !assistantSpeakingRef.current) {
          onUserSpeechStartRef.current?.();
        }

        if (result.isFinal) {
          if (looksEcho) {
            continue;
          }

          pendingFinalRef.current = chunk;
          if (finalSendTimerRef.current) {
            window.clearTimeout(finalSendTimerRef.current);
          }
          finalSendTimerRef.current = window.setTimeout(() => {
            flushPendingFinal();
            finalSendTimerRef.current = null;
          }, 520);
        } else {
          setLiveTranscript(chunk);
        }
      }
    };

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) {
        return;
      }

      const fatal = event.error === "not-allowed" || event.error === "service-not-allowed";
      if (fatal) {
        setVoiceError("Microphone permission was denied. Enable microphone access and retry.");
        shouldContinueRef.current = false;
        setMicMode(false);
      } else {
        setVoiceError("Mic recovered from a temporary issue. Continuing to listen...");
      }
      setListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) {
        return;
      }

      recognitionRef.current = null;
      setListening(false);

      if (shouldContinueRef.current) {
        if (restartTimerRef.current) {
          window.clearTimeout(restartTimerRef.current);
        }

        restartTimerRef.current = window.setTimeout(() => {
          startMicLoop();
        }, 300);
      }
    };

    return recognition;
  };

  const startMicLoop = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        // Ignore duplicate start calls; onend watchdog will recover if needed.
      }
      return;
    }

    const recognition = createRecognition();
    if (!recognition) {
      shouldContinueRef.current = false;
      setMicMode(false);
      return;
    }

    recognitionRef.current = recognition;
    setVoiceError(null);
    shouldContinueRef.current = true;
    try {
      recognition.start();
    } catch {
      setVoiceError("Mic start failed, retrying automatically...");
    }
  };

  const stopMicLoop = () => {
    shouldContinueRef.current = false;
    setListening(false);
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (finalSendTimerRef.current) {
      window.clearTimeout(finalSendTimerRef.current);
      finalSendTimerRef.current = null;
    }
    flushPendingFinal();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  };

  const ensureMicrophonePermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("This runtime does not expose microphone APIs.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      setVoiceError("Microphone permission was denied. Enable mic access in OS settings and retry.");
      return false;
    }
  };

  const handleVoiceToggle = async () => {
    const next = !micMode;
    setMicMode(next);
    setLiveTranscript("");
    if (next) {
      const hasPermission = await ensureMicrophonePermission();
      if (!hasPermission) {
        shouldContinueRef.current = false;
        setMicMode(false);
        return;
      }
      startMicLoop();
    } else {
      stopMicLoop();
    }
  };

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    onUserSpeechStartRef.current = onUserSpeechStart;
  }, [onUserSpeechStart]);

  useEffect(() => {
    latestAssistantTextRef.current = latestAssistantText;
  }, [latestAssistantText]);

  useEffect(() => {
    assistantSpeakingRef.current = assistantSpeaking;
    if (assistantSpeaking) {
      assistantSpeechAtRef.current = Date.now();
    }
  }, [assistantSpeaking]);

  useEffect(() => {
    speechLangRef.current = speechLang;

    if (micMode) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      window.setTimeout(() => {
        if (shouldContinueRef.current) {
          startMicLoop();
        }
      }, 120);
    }
  }, [speechLang, micMode]);

  useEffect(() => {
    if (!micMode) {
      return;
    }

    const id = window.setInterval(() => {
      if (!shouldContinueRef.current) {
        return;
      }

      if (listening && recognitionStartedAtRef.current > 0) {
        const activeMs = Date.now() - recognitionStartedAtRef.current;
        if (activeMs > 45000) {
          recognitionRef.current?.stop();
          return;
        }
      }

      if (!listening && !recognitionRef.current) {
        startMicLoop();
      }
    }, 1800);

    return () => window.clearInterval(id);
  }, [micMode, listening]);

  useEffect(() => {
    if (!micMode || listening) {
      return;
    }

    startMicLoop();
  }, [micMode, listening]);

  useEffect(() => {
    return () => {
      stopMicLoop();
    };
  }, []);

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,image/png,image/jpeg,.jpg,.jpeg"
        onChange={handleFilesChange}
        aria-label="Attach files"
        title="Attach files"
      />

      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 sm:gap-2 rounded-lg border border-cyan-300/30 bg-gradient-to-r from-cyan-950/30 to-black/40 p-2 sm:p-3 shadow-md shadow-cyan-950/20">
          {selectedFiles.map((file, index) => (
            <button
              key={`${file.name}-${file.size}-${index}`}
              type="button"
              className="rounded-lg border border-cyan-300/50 bg-gradient-to-r from-cyan-900/40 to-cyan-950/20 px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-[11px] text-cyan-100/95 transition-all duration-200 hover:border-cyan-300/70 hover:from-cyan-900/60 hover:to-cyan-950/40 shadow-sm hover:shadow-md hover:shadow-cyan-900/30 touch-manipulation min-h-[36px] sm:min-h-auto flex items-center"
              onClick={() => removeSelectedFile(index)}
              title="Remove attachment"
            >
              📄 <span className="hidden sm:inline ml-1">{file.name.split("/").pop()}</span> ✕
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 rounded-lg sm:rounded-xl border border-cyan-200/40 bg-gradient-to-r from-black/70 to-cyan-950/20 px-2 sm:px-3 py-2 sm:py-2.5 shadow-lg shadow-cyan-950/20 transition-all duration-200 hover:border-cyan-200/60 hover:shadow-cyan-950/30 focus-within:border-cyan-200/70 focus-within:bg-gradient-to-r focus-within:from-black/80 focus-within:to-cyan-900/25">
      {!micMode && <span className="hidden sm:inline text-emerald-300 font-bold text-lg">&gt;</span>}

      {!micMode && (
        <input
          className="flex-1 bg-transparent text-emerald-100 outline-none placeholder:text-emerald-200/40 disabled:cursor-not-allowed disabled:text-emerald-100/45 transition-colors duration-200 font-mono text-sm sm:text-base"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={disabled ? "TARS is thinking..." : "Ask TARS or attach files..."}
          onKeyDown={(event) => event.key === "Enter" && handleSend()}
          disabled={disabled}
        />
      )}

      {micMode && (
        <div className="flex-1 rounded-lg border border-cyan-300/40 bg-gradient-to-r from-cyan-950/30 to-cyan-900/20 px-2 sm:px-3 py-2 text-xs sm:text-sm text-cyan-100/90 font-mono shadow-inner">
          {liveTranscript || "Voice mode armed. Speak naturally."}
        </div>
      )}

      <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
        <button
          type="button"
          className={`flex-1 sm:flex-none rounded-lg border px-2 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.2em] font-semibold transition-all duration-200 shadow-md min-h-[44px] sm:min-h-auto touch-manipulation ${
            micMode
              ? "border-red-400/60 bg-gradient-to-b from-red-500/25 to-red-600/15 text-red-100 hover:from-red-500/35 hover:to-red-600/25 hover:shadow-lg hover:shadow-red-900/30 active:shadow-red-950/50 active:from-red-500/40"
              : "border-cyan-200/50 bg-gradient-to-b from-cyan-400/15 to-cyan-500/10 text-cyan-100 hover:from-cyan-400/25 hover:to-cyan-500/20 hover:shadow-lg hover:shadow-cyan-900/40 active:shadow-cyan-950/50 active:from-cyan-400/30"
          } disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none`}
          onClick={handleVoiceToggle}
          title={micMode ? "Disable voice mode" : "Enable voice mode"}
        >
          <span className="hidden sm:inline">{micMode ? "🎤" : "🎙️"} {micMode ? "ON" : "OFF"}</span>
          <span className="sm:hidden">{micMode ? "🎤 ON" : "🎙️"}</span>
        </button>

        <button
          type="button"
          className="flex-1 sm:flex-none rounded-lg border border-cyan-200/50 bg-gradient-to-b from-cyan-400/15 to-cyan-500/10 px-2 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm tracking-widest font-semibold text-cyan-100 transition-all duration-200 shadow-md hover:from-cyan-400/25 hover:to-cyan-500/20 hover:shadow-lg hover:shadow-cyan-900/40 active:shadow-cyan-950/50 active:from-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-h-[44px] sm:min-h-auto touch-manipulation"
          onClick={handlePickFiles}
          disabled={disabled || selectedFiles.length >= 6}
          title="Attach files"
        >
          <span className="hidden sm:inline">📎 FILES</span>
          <span className="sm:hidden">📎</span>
        </button>

        {!micMode && (
          <button
            type="button"
            className="flex-1 sm:flex-none rounded-lg border border-emerald-200/50 bg-gradient-to-b from-emerald-400/15 to-emerald-500/10 px-2 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.2em] font-semibold text-emerald-100 transition-all duration-200 shadow-md hover:from-emerald-400/25 hover:to-emerald-500/20 hover:shadow-lg hover:shadow-emerald-900/40 active:shadow-emerald-950/50 active:from-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-h-[44px] sm:min-h-auto touch-manipulation"
            onClick={handleSend}
            disabled={disabled || (!text.trim() && selectedFiles.length === 0)}
            title="Send message"
          >
            <span className="hidden sm:inline">↳ SEND</span>
            <span className="sm:hidden">SEND</span>
          </button>
        )}
      </div>
      </div>

      {voiceError && <p className="text-xs text-red-300/90">{voiceError}</p>}
      {attachmentError && <p className="text-xs text-cyan-200/90">{attachmentError}</p>}
      {listening && <p className="text-xs text-cyan-200/90">Mic mode active. Speak naturally and each sentence will be sent automatically.</p>}
    </div>
  );
};

export default InputBox;
