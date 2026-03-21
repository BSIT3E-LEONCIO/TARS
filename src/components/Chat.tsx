import { useEffect, useMemo, useRef, useState } from "react";
import InputBox from "./InputBox";
import Message from "./Message";
import { getTarsReply } from "../lib/tarsApi";
import { speak as speakTTS, stop as stopTTS } from "../lib/ttsService";
import Waveform from "./Waveform.tsx";
import tarsLogo from "../assets/tars.svg";

type ChatMessage = {
  id: string;
  sender: "user" | "tars";
  text: string;
};

type VoiceProfile = {
  locale: string;
  label: string;
};

type PersonaKey = "commander" | "engineer" | "companion" | "operator" | "observer";

type PersonalitySettings = {
  humor: number;
  honesty: number;
  sarcasm: number;
  sympathy: number;
  compassion: number;
};

type PersonaPreset = {
  key: PersonaKey;
  label: string;
  description: string;
  rate: number;
  pitch: number;
};

type AssistantCommandResult = {
  acknowledged: boolean;
  ackText?: string;
};

const DEFAULT_VOICE_PROFILE: VoiceProfile = { locale: "en-GB", label: "ENGLISH (UK)" };

const DEFAULT_PERSONALITY: PersonalitySettings = {
  humor: 55,
  honesty: 90,
  sarcasm: 30,
  sympathy: 45,
  compassion: 40,
};

const PERSONA_PRESETS: Record<PersonaKey, PersonaPreset> = {
  commander: {
    key: "commander",
    label: "COMMANDER",
    description: "Calm, authoritative, strategic guidance.",
    rate: 1.1,
    pitch: 1.1,
  },
  engineer: {
    key: "engineer",
    label: "ENGINEER",
    description: "Analytical, precise, technical communication.",
    rate: 1.08,
    pitch: 0.8,
  },
  companion: {
    key: "companion",
    label: "COMPANION",
    description: "Friendly, empathetic, conversational tone.",
    rate: 1.04,
    pitch: 0.92,
  },
  operator: {
    key: "operator",
    label: "OPERATOR",
    description: "Fast, efficient, minimal-response style.",
    rate: 1.16,
    pitch: 0.76,
  },
  observer: {
    key: "observer",
    label: "OBSERVER",
    description: "Neutral, factual, detached reporting style.",
    rate: 1.02,
    pitch: 0.72,
  },
};

const VOICE_LANGUAGE_PATTERNS: Array<{ pattern: RegExp; profile: VoiceProfile }> = [
  { pattern: /english|original|american/i, profile: { locale: "en-US", label: "ENGLISH (US)" } },
  { pattern: /british|uk english|england/i, profile: { locale: "en-GB", label: "ENGLISH (UK)" } },
  { pattern: /australian|aussie/i, profile: { locale: "en-AU", label: "ENGLISH (AU)" } },
  { pattern: /canadian english|canadian/i, profile: { locale: "en-CA", label: "ENGLISH (CA)" } },
  { pattern: /indian english/i, profile: { locale: "en-IN", label: "ENGLISH (IN)" } },
  { pattern: /spanish|espanol/i, profile: { locale: "es-ES", label: "SPANISH" } },
  { pattern: /french|francais/i, profile: { locale: "fr-FR", label: "FRENCH" } },
  { pattern: /german|deutsch/i, profile: { locale: "de-DE", label: "GERMAN" } },
  { pattern: /italian|italiano/i, profile: { locale: "it-IT", label: "ITALIAN" } },
  { pattern: /portuguese brazil|brazilian portuguese/i, profile: { locale: "pt-BR", label: "PORTUGUESE (BR)" } },
  { pattern: /portuguese|portugues/i, profile: { locale: "pt-PT", label: "PORTUGUESE" } },
  { pattern: /filipino|tagalog/i, profile: { locale: "fil-PH", label: "FILIPINO" } },
  { pattern: /indonesian|bahasa indonesia/i, profile: { locale: "id-ID", label: "INDONESIAN" } },
  { pattern: /japanese|nihongo|japan/i, profile: { locale: "ja-JP", label: "JAPANESE" } },
  { pattern: /korean|hangul|hangugeo/i, profile: { locale: "ko-KR", label: "KOREAN" } },
  { pattern: /chinese|mandarin|simplified chinese/i, profile: { locale: "zh-CN", label: "CHINESE" } },
  { pattern: /traditional chinese|taiwanese/i, profile: { locale: "zh-TW", label: "CHINESE (TRADITIONAL)" } },
  { pattern: /arabic/i, profile: { locale: "ar-SA", label: "ARABIC" } },
  { pattern: /hindi/i, profile: { locale: "hi-IN", label: "HINDI" } },
  { pattern: /russian/i, profile: { locale: "ru-RU", label: "RUSSIAN" } },
  { pattern: /thai/i, profile: { locale: "th-TH", label: "THAI" } },
  { pattern: /vietnamese|tieng viet/i, profile: { locale: "vi-VN", label: "VIETNAMESE" } },
];

const createMessage = (sender: "user" | "tars", text: string): ChatMessage => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sender,
  text,
});

const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const traitMap: Record<string, keyof PersonalitySettings> = {
  humor: "humor",
  honesty: "honesty",
  sarcasm: "sarcasm",
  sympathy: "sympathy",
  compassion: "compassion",
};

const parsePersona = (input: string): PersonaKey | null => {
  const normalized = input.toLowerCase();
  if (/commander/.test(normalized)) return "commander";
  if (/engineer/.test(normalized)) return "engineer";
  if (/companion/.test(normalized)) return "companion";
  if (/operator/.test(normalized)) return "operator";
  if (/observer/.test(normalized)) return "observer";
  return null;
};

const isEnglishLocale = (locale: string) => locale.toLowerCase().startsWith("en");

const toWordOffsets = (text: string) => {
  const regex = /\S+/g;
  const offsets: Array<{ start: number; end: number }> = [];
  let found = regex.exec(text);
  while (found) {
    offsets.push({ start: found.index, end: found.index + found[0].length });
    found = regex.exec(text);
  }
  return offsets;
};

const findWordProgress = (charIndex: number, offsets: Array<{ start: number; end: number }>) => {
  if (!offsets.length) {
    return 0;
  }

  for (let index = 0; index < offsets.length; index += 1) {
    if (charIndex < offsets[index].start) {
      return index;
    }
    if (charIndex >= offsets[index].start && charIndex <= offsets[index].end) {
      return index + 1;
    }
  }
  return offsets.length;
};

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "tars",
      "TARS online. Voice-first channel active. Configure personality and persona by command, for example: 'TARS, set humor to 70%' or 'switch to Commander mode'.",
    ),
  ]);
  const [typing, setTyping] = useState(false);
  const [personality, setPersonality] = useState<PersonalitySettings>(DEFAULT_PERSONALITY);
  const [persona, setPersona] = useState<PersonaKey>("commander");
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(DEFAULT_VOICE_PROFILE);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [spokenWords, setSpokenWords] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const autoFollowRef = useRef(true);
  const lastKaraokeScrollAtRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const speechJobRef = useRef(0);
  const fxContextRef = useRef<AudioContext | null>(null);
  const fxSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fxGainRef = useRef<GainNode | null>(null);

  const latestAssistantText = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].sender === "tars") {
        return messages[index].text;
      }
    }
    return "";
  }, [messages]);

  const interruptTarsSpeech = () => {
    if ("speechSynthesis" in window) {
      speechJobRef.current += 1;
      stopTTS();
      setAssistantSpeaking(false);
      setSpeakingMessageId(null);
      setSpokenWords(0);
      if (fxGainRef.current && fxContextRef.current) {
        const now = fxContextRef.current.currentTime;
        fxGainRef.current.gain.setValueAtTime(fxGainRef.current.gain.value, now);
        fxGainRef.current.gain.linearRampToValueAtTime(0, now + 0.08);
      }
    }
  };

  const startRadioFx = async () => {
    if (!("AudioContext" in window || "webkitAudioContext" in window)) {
      return;
    }

    if (fxSourceRef.current) {
      return;
    }

    const AudioContextCtor = (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioContextCtor) {
      return;
    }

    const context = fxContextRef.current ?? new AudioContextCtor();
    fxContextRef.current = context;

    if (context.state === "suspended") {
      await context.resume();
    }

    const frameCount = Math.max(1, Math.floor(context.sampleRate * 0.5));
    const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * 0.24;
    }

    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 520;

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3600;

    const gain = context.createGain();
    gain.gain.value = 0;

    noise.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(context.destination);

    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.009, now + 0.07);

    noise.start();
    fxSourceRef.current = noise;
    fxGainRef.current = gain;
  };

  const stopRadioFx = () => {
    const source = fxSourceRef.current;
    const gain = fxGainRef.current;
    const context = fxContextRef.current;

    if (!source || !gain || !context) {
      return;
    }

    const now = context.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.08);

    window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        // Ignore repeated stop calls.
      }
      source.disconnect();
      fxSourceRef.current = null;
      fxGainRef.current = null;
    }, 100);
  };

  const handleUserSpeechStart = () => {
    interruptTarsSpeech();
    activeRequestRef.current?.abort();
    setTyping(false);
  };

  const normalizeForSpeech = (text: string) =>
    text
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

  const resolvedSpeechLang = voiceProfile.locale;

  const parseVoiceCommand = (input: string): VoiceProfile | "reset" | null => {
    const normalized = input.toLowerCase().trim();

    const resetPatterns = [
      /\b(back to|return to|reset to|switch to)\s+(original|default|english)\b/i,
      /\b(use|speak)\s+(original|default|english)\b/i,
      /\boriginal tars\b/i,
    ];

    if (resetPatterns.some((pattern) => pattern.test(normalized))) {
      return "reset";
    }

    const commandIntent = /(switch|change|set|use|speak|talk|voice|accent|language|nationality)/i;
    if (!commandIntent.test(normalized)) {
      return null;
    }

    const matched = VOICE_LANGUAGE_PATTERNS.find(({ pattern }) => pattern.test(normalized));
    if (!matched) {
      return null;
    }

    return matched.profile;
  };

  const applyAssistantCommand = (input: string): AssistantCommandResult => {
    const normalized = input.toLowerCase().trim();

    if (/\b(mute|disable)\s+(voice output|voice|tts)\b/i.test(normalized)) {
      setVoiceOutput(false);
      return { acknowledged: true, ackText: "Voice output muted." };
    }

    if (/\b(unmute|enable|turn on)\s+(voice output|voice|tts)\b/i.test(normalized)) {
      setVoiceOutput(true);
      return { acknowledged: true, ackText: "Voice output enabled." };
    }

    const personaCommand = /(switch|set|change|activate)\s+(to\s+)?(commander|engineer|companion|operator|observer)(\s+mode)?/i;
    if (personaCommand.test(normalized)) {
      const nextPersona = parsePersona(normalized);
      if (nextPersona) {
        setPersona(nextPersona);
        const preset = PERSONA_PRESETS[nextPersona];
        return {
          acknowledged: true,
          ackText: `Persona switched to ${preset.label}. ${preset.description}`,
        };
      }
    }

    const traitSetPattern = /(set|adjust)\s+(humor|honesty|sarcasm|sympathy|compassion)\s+(to)\s*(\d{1,3})\s*%?/i;
    const setMatch = normalized.match(traitSetPattern);
    if (setMatch) {
      const trait = traitMap[setMatch[2]];
      const value = clampPercentage(Number(setMatch[4]));
      setPersonality((prev) => ({ ...prev, [trait]: value }));
      return {
        acknowledged: true,
        ackText: `${trait.toUpperCase()} updated to ${value} percent.`,
      };
    }

    const traitNudgePattern = /(increase|decrease)\s+(humor|honesty|sarcasm|sympathy|compassion)(\s+by\s+(\d{1,2}))?/i;
    const nudgeMatch = normalized.match(traitNudgePattern);
    if (nudgeMatch) {
      const trait = traitMap[nudgeMatch[2]];
      const delta = Number(nudgeMatch[4] ?? "10");
      const signedDelta = nudgeMatch[1] === "increase" ? delta : -delta;
      let nextValue = 0;
      setPersonality((prev) => {
        nextValue = clampPercentage(prev[trait] + signedDelta);
        return { ...prev, [trait]: nextValue };
      });

      return {
        acknowledged: true,
        ackText: `${trait.toUpperCase()} adjusted to ${nextValue} percent.`,
      };
    }

    return { acknowledged: false };
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  };

  const centerMessageInViewport = (messageId: string, behavior: ScrollBehavior = "auto", wordProgress: number = 0) => {
    const viewport = viewportRef.current;
    const messageNode = messageElementMapRef.current.get(messageId);
    if (!viewport || !messageNode) {
      return;
    }

    const msgText = messages.find((m) => m.id === messageId)?.text ?? "";
    const totalWords = msgText.split(/\s+/).filter((w) => w.length > 0).length;
    const progressRatio = totalWords > 0 ? Math.min(1, wordProgress / totalWords) : 0;
    
    const msgHeight = messageNode.offsetHeight;
    const estimatedScrollWithin = msgHeight * Math.pow(progressRatio, 0.95);
    
    const targetTop = messageNode.offsetTop + estimatedScrollWithin - viewport.clientHeight * 0.38;
    const clampedTop = Math.max(0, Math.min(targetTop, viewport.scrollHeight - viewport.clientHeight));
    
    const currentScroll = viewport.scrollTop;
    const delta = clampedTop - currentScroll;
    const smoothedTop = delta > 200 || delta < -200 ? clampedTop : currentScroll + delta * 0.18;
    
    viewport.scrollTo({ top: smoothedTop, behavior });
  };

  const handleViewportScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    // Show scrollbar on scroll
    setIsScrolling(true);
    if (scrollFadeTimeoutRef.current) {
      window.clearTimeout(scrollFadeTimeoutRef.current);
    }
    scrollFadeTimeoutRef.current = window.setTimeout(() => {
      setIsScrolling(false);
    }, 2500);

    if (assistantSpeaking) {
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    autoFollowRef.current = distanceFromBottom < 140;
  };

  const speakAsTars = async (text: string, messageId?: string, languageOverride?: string) => {
    if (!voiceOutput || !("speechSynthesis" in window)) {
      return;
    }

    const speechText = normalizeForSpeech(text);
    if (!speechText) {
      return;
    }

    const speechJob = speechJobRef.current + 1;
    speechJobRef.current = speechJob;
    const activeLang = languageOverride ?? resolvedSpeechLang;
    const activePersona = isEnglishLocale(activeLang) ? PERSONA_PRESETS[persona] : PERSONA_PRESETS.commander;
    const wordOffsets = toWordOffsets(speechText);
    let fallbackTicker: number | null = null;
    let startedAt = 0;

    const onSpeechFinished = () => {
      if (fallbackTicker) {
        window.clearInterval(fallbackTicker);
        fallbackTicker = null;
      }

      setAssistantSpeaking(false);
      setSpeakingMessageId(null);
      setSpokenWords(0);
      stopRadioFx();
    };

    await speakTTS(speechText, {
      lang: activeLang,
      rate: activePersona.rate,
      pitch: activePersona.pitch,
      volume: 0.94,
      onStart: () => {
        if (speechJobRef.current !== speechJob) {
          return;
        }

        setAssistantSpeaking(true);
        setSpeakingMessageId(messageId ?? null);
        setSpokenWords(0);
        autoFollowRef.current = true;
        startedAt = performance.now();

        if (wordOffsets.length > 0) {
          fallbackTicker = window.setInterval(() => {
            const elapsed = performance.now() - startedAt;
            const perWordMs = 380 / Math.max(0.72, activePersona.rate);
            const estimated = Math.min(wordOffsets.length, Math.floor(elapsed / perWordMs));
            setSpokenWords((prev) => (estimated > prev ? estimated : prev));
          }, 120);
        }

        void startRadioFx();
      },
      onWordBoundary: (event) => {
        if (speechJobRef.current !== speechJob) {
          return;
        }

        const progress = findWordProgress(event.charIndex, wordOffsets);
        setSpokenWords(progress);
      },
      onEnd: onSpeechFinished,
      onError: () => {
        onSpeechFinished();
      },
    });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    // Secret code 143
    if (/143/.test(trimmed)) {
       const secretMessage = "My creator Jayce thinks you are truly special, Jem. He made me just for you.";
      const secretReplyMessage = createMessage("tars", secretMessage);
      setMessages((prev) => [...prev, secretReplyMessage]);
      setTyping(false);
      speakAsTars(secretMessage, secretReplyMessage.id);
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const userMessage: ChatMessage = createMessage("user", trimmed);

    const nextDisplayConversation = [...messages, userMessage];
    setMessages(nextDisplayConversation);
    setTyping(true);
    setError(null);

    try {
      const voiceCommand = parseVoiceCommand(trimmed);
      if (voiceCommand) {
        const profile = voiceCommand === "reset" ? DEFAULT_VOICE_PROFILE : voiceCommand;
        setVoiceProfile(profile);
        const ack =
          voiceCommand === "reset"
            ? "Voice profile restored. Original TARS English channel is online."
            : `Voice profile switched to ${profile.label}. I will continue in this language.`;
        const ackMessage = createMessage("tars", ack);
        setMessages((prev) => [...prev, ackMessage]);
        setTyping(false);
        speakAsTars(ack, ackMessage.id, profile.locale);
        return;
      }

      const commandResult = applyAssistantCommand(trimmed);
      if (commandResult.acknowledged && commandResult.ackText) {
        const ackMessage = createMessage("tars", commandResult.ackText);
        setMessages((prev) => [...prev, ackMessage]);
        setTyping(false);
        speakAsTars(commandResult.ackText, ackMessage.id);
        return;
      }

      const nextModelConversation: ChatMessage[] = [
        ...messages,
        createMessage("user", trimmed),
      ];

      const activePersona = isEnglishLocale(voiceProfile.locale) ? persona : "observer";
      const reply = await getTarsReply(
        nextModelConversation,
        {
          ...personality,
          persona: activePersona,
          speechLang: voiceProfile.locale,
        },
        controller.signal,
      );

      if (controller.signal.aborted) {
        return;
      }

      const replyMessage = createMessage("tars", reply);
      setMessages((prev) => [...prev, replyMessage]);
      speakAsTars(reply, replyMessage.id);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }

      const message =
        caught instanceof Error
          ? caught.message
          : "Unknown communications error.";

      setError(message);
      setMessages((prev) => [
        ...prev,
        createMessage("tars", "I cannot reach the primary intelligence uplink. Check your API key and endpoint settings."),
      ]);
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setTyping(false);
      }
    }
  };

  useEffect(() => {
    if (!autoFollowRef.current) {
      return;
    }

    const behavior: ScrollBehavior = messages.length > 1 ? "smooth" : "auto";
    scrollToBottom(behavior);
  }, [messages.length, typing]);

  useEffect(() => {
    if (!assistantSpeaking || !speakingMessageId) {
      return;
    }

    const now = performance.now();
    if (now - lastKaraokeScrollAtRef.current < 50) {
      return;
    }

    lastKaraokeScrollAtRef.current = now;
    centerMessageInViewport(speakingMessageId, "auto", spokenWords);
  }, [assistantSpeaking, speakingMessageId, spokenWords, messages]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        stopTTS();
        setAssistantSpeaking(false);
      }
      stopRadioFx();
      activeRequestRef.current?.abort();
      if (scrollFadeTimeoutRef.current) {
        window.clearTimeout(scrollFadeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section className="tars-shell relative flex h-[90vh] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-lg sm:rounded-2xl border border-cyan-300/50 bg-black/85 p-2 sm:p-4 md:p-6 text-cyan-100 shadow-[0_0_40px_rgba(62,208,255,0.2)]">
      <div className="pointer-events-none absolute inset-0 tars-grid opacity-70" />

      <header className="relative z-10 mb-2 sm:mb-3 flex flex-col items-center sm:grid gap-2 sm:gap-4 border-b border-cyan-200/20 pb-2 sm:pb-3 sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="flex flex-col items-center sm:items-start">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <img src={tarsLogo} alt="TARS" className="h-14 w-7 sm:h-20 sm:w-10 opacity-90" />
            <div className="text-center sm:text-left">
              <p className="text-[9px] sm:text-xs tracking-[0.3em] sm:tracking-[0.38em] text-cyan-200/70">ENDURANCE AI</p>
              <h1 className="mt-0.5 sm:mt-1 text-2xl sm:text-3xl font-semibold tracking-[0.15em] sm:tracking-[0.18em] text-cyan-100">TARS</h1>
            </div>
          </div>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-cyan-100/75">Online.</p>
        </div>
        <Waveform active={assistantSpeaking} seed={spokenWords} />
      </header>

      <div
        ref={viewportRef}
        onScroll={handleViewportScroll}
        className={`chat-viewport relative z-10 flex-1 min-h-0 overflow-y-auto pr-1 ${isScrolling ? "scrolling" : ""}`}
      >
        <div className="space-y-3 pb-2">
          {messages.map((msg, index) => (
            <div
              key={`${msg.id}-${index}`}
              ref={(node) => {
                if (node) {
                  messageElementMapRef.current.set(msg.id, node);
                } else {
                  messageElementMapRef.current.delete(msg.id);
                }
              }}
            >
              <Message
                sender={msg.sender}
                text={msg.text}
                karaokeActive={msg.id === speakingMessageId}
                spokenWords={msg.id === speakingMessageId ? spokenWords : 0}
              />
            </div>
          ))}

          {typing && (
            <div className="rounded-lg border border-cyan-300/40 bg-linear-to-r from-cyan-950/30 to-cyan-900/15 px-4 py-3 text-sm text-cyan-100/85 shadow-md shadow-cyan-950/20 font-mono">
              <span className="inline-block animate-pulse">▌</span> TARS is computing trajectory...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-400/50 bg-linear-to-r from-red-950/40 to-red-900/20 px-4 py-3 text-sm text-red-200/90 shadow-md shadow-red-950/30 font-mono">
              ⚠ Uplink error: {error}
            </div>
          )}
        </div>
      </div>

      <footer className="relative z-10 mt-4 border-t border-cyan-200/20 pt-4">
        <InputBox
          onSend={sendMessage}
          onUserSpeechStart={handleUserSpeechStart}
          latestAssistantText={latestAssistantText}
          assistantSpeaking={assistantSpeaking}
          speechLang={voiceProfile.locale}
        />
      </footer>
    </section>
  );
};

export default Chat;