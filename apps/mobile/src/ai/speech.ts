import { Platform } from "react-native";
import { LANGS, type Lang } from "../ui/prefs";

/**
 * HEAR and TALK on the free platform speech engines (owner choice, 2026-10-24). Listening runs only while the user
 * holds a microphone session; speaking can be interrupted at any time (G18, G19).
 * Chrome's recognition sends audio to Google for transcription; the cloud notice says so.
 */
const locale = (lang: Lang) => LANGS[lang].locale;

/** Installed voices for a language. Browsers report tags as "en-US" or "en_US"; both match. */
function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(lang));
}

/** Picks the most natural-sounding installed voice for a language (neural or online voices first). */
function bestVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    (v.lang.toLowerCase() === locale(lang).toLowerCase() ? 1 : 0);
  return voicesFor(lang).sort((a, b) => score(b) - score(a))[0];
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionClass(): (new () => RecognitionLike) | undefined {
  if (Platform.OS !== "web") {
    return undefined;
  }
  const w = globalThis as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function canListen(): boolean {
  return recognitionClass() !== undefined;
}

export function canSpeak(): boolean {
  return Platform.OS === "web" && typeof speechSynthesis !== "undefined";
}

export interface Listening {
  stop(): void;
}

export function listen(
  lang: Lang,
  handlers: {
    onPartial: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (code: string) => void;
    onEnd: () => void;
  },
): Listening {
  const Recognition = recognitionClass();
  if (Recognition === undefined) {
    handlers.onError("UNSUPPORTED");
    handlers.onEnd();
    return { stop: () => undefined };
  }
  stopSpeaking();
  const rec = new Recognition();
  rec.lang = locale(lang);
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = (event) => {
    let partial = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result?.[0]?.transcript ?? "";
      if (result?.isFinal === true) {
        finalText += text;
      } else {
        partial += text;
      }
    }
    handlers.onPartial((finalText + partial).trim());
  };
  rec.onerror = (event) => handlers.onError(event.error);
  rec.onend = () => {
    if (finalText.trim() !== "") {
      handlers.onFinal(finalText.trim());
    }
    handlers.onEnd();
  };
  rec.start();
  return { stop: () => rec.stop() };
}

export function hasVoiceFor(lang: Lang): boolean {
  return canSpeak() && voicesFor(lang).length > 0;
}

export function speak(text: string, lang: Lang, rate: number, onDone?: () => void): void {
  if (!canSpeak()) {
    onDone?.();
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale(lang);
  utterance.rate = rate;
  const voice = bestVoice(lang);
  if (voice !== undefined) {
    utterance.voice = voice;
  }
  utterance.onend = () => onDone?.();
  utterance.onerror = () => onDone?.();
  speechSynthesis.speak(utterance);
}

/** Interruption: stops speech output at once. */
export function stopSpeaking(): void {
  if (canSpeak()) {
    speechSynthesis.cancel();
  }
}

export function listenErrorText(code: string): string {
  switch (code) {
    case "UNSUPPORTED":
      return "This browser has no speech recognition. Use Chrome or Edge, or type instead.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was refused. Allow it in the browser, then try again.";
    case "no-speech":
      return "No speech was heard. Try again a little closer to the microphone.";
    case "network":
      return "Speech recognition needs a network connection.";
    default:
      return "Listening stopped. Try again.";
  }
}
