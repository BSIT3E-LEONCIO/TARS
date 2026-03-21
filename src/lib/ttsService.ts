type TTSWordBoundaryEvent = {
  charIndex: number;
};

type TTSSpeakOptions = {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
  onWordBoundary?: (event: TTSWordBoundaryEvent) => void;
};

const EDGE_TTS_VOICE = "en-GB-RyanNeural";
const BROWSER_LANG_FALLBACK = "en-GB";

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

const normalizeLocale = (value: string) => value.toLowerCase().replace("_", "-");

const getLanguageRoot = (value: string) => normalizeLocale(value).split("-")[0];

const pickPreferredBrowserVoice = (voices: SpeechSynthesisVoice[], preferredLang: string) => {
  const lang = normalizeLocale(preferredLang);
  const langRoot = getLanguageRoot(lang);
  const isUKEnglishRequest = lang === "en-gb";

  if (isUKEnglishRequest) {
    const byExactRyanName = voices.find((voice) => /en[-_ ]gb[-_ ]ryan/i.test(voice.name));
    if (byExactRyanName) {
      return byExactRyanName;
    }

    const byRyanLikeName = voices.find(
      (voice) => /ryan/i.test(voice.name) && normalizeLocale(voice.lang).startsWith("en-gb"),
    );
    if (byRyanLikeName) {
      return byRyanLikeName;
    }

    const byBritishMaleHint = voices.find(
      (voice) =>
        normalizeLocale(voice.lang).startsWith("en-gb") &&
        /(male|david|george|ryan|uk)/i.test(voice.name),
    );
    if (byBritishMaleHint) {
      return byBritishMaleHint;
    }
  }

  const byPreferredLang = voices.find((voice) => normalizeLocale(voice.lang) === lang);
  if (byPreferredLang) {
    return byPreferredLang;
  }

  const byLanguageRoot = voices.find((voice) => getLanguageRoot(voice.lang) === langRoot);
  if (byLanguageRoot) {
    return byLanguageRoot;
  }

  if (langRoot === "en") {
    const anyEnglish = voices.find((voice) => getLanguageRoot(voice.lang) === "en");
    if (anyEnglish) {
      return anyEnglish;
    }
  }

  return voices[0] ?? null;
};

const getVoicesReady = async () => {
  const synth = window.speechSynthesis;
  const immediate = synth.getVoices();
  if (immediate.length > 0) {
    return immediate;
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
      resolve(synth.getVoices());
    };

    const handleVoicesChanged = () => finish();

    synth.addEventListener("voiceschanged", handleVoicesChanged);
    window.setTimeout(finish, 900);
  });
};

export const stop = () => {
  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
};

export const speak = async (text: string, options: TTSSpeakOptions = {}) => {
  if (!("speechSynthesis" in window)) {
    options.onError?.(new Error("Speech synthesis is not supported in this browser."));
    return null;
  }

  const speechText = normalizeText(text);
  if (!speechText) {
    return null;
  }

  const lang = options.lang ?? BROWSER_LANG_FALLBACK;
  const voices = await getVoicesReady();
  const utterance = new SpeechSynthesisUtterance(speechText);

  utterance.lang = lang;
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 0.94;

  const preferredVoice = pickPreferredBrowserVoice(voices, lang);
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onstart = () => {
    options.onStart?.();
  };

  utterance.onboundary = (event: SpeechSynthesisEvent) => {
    if (event.name !== "word") {
      return;
    }

    options.onWordBoundary?.({ charIndex: event.charIndex });
  };

  utterance.onerror = (event) => {
    options.onError?.(event.error);
  };

  utterance.onend = () => {
    options.onEnd?.();
  };

  stop();
  window.speechSynthesis.speak(utterance);

  return utterance;
};

export const generateAudioFile = async (text: string, filename: string) => {
  const cleanedText = normalizeText(text);
  if (!cleanedText) {
    throw new Error("Cannot generate audio for empty text.");
  }

  const safeFilename = filename.toLowerCase().endsWith(".mp3") ? filename : `${filename}.mp3`;

  // Browser clients call a backend route so Edge TTS authentication secrets stay server-side.
  const response = await fetch("/api/tts/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: cleanedText,
      voiceName: EDGE_TTS_VOICE,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Failed to generate MP3 from Edge TTS.");
  }

  const audioBlob = await response.blob();
  const downloadUrl = URL.createObjectURL(audioBlob);

  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(downloadUrl);
};

export const EDGE_TTS_DEFAULT_VOICE = EDGE_TTS_VOICE;
