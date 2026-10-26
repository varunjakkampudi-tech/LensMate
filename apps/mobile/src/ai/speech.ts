import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { LANGS, type Lang } from "../ui/prefs";
import {
  nativeListenErrorText,
  loadNativeRecognizer,
  startNativeListening,
  type NativeListenError,
} from "./native-listen";

/**
 * HEAR and TALK on the free platform speech engines (owner choice, 2026-10-24). Listening runs only while the user
 * holds a microphone session; speaking can be interrupted at any time (G18, G19).
 * Chrome's recognition sends audio to Google for transcription; the cloud notice says so.
 * Native phones speak through expo-speech, which uses the device's own text-to-speech engine (no cloud route).
 * Native listening is not built: it needs an on-device recogniser verified on a phone (see docs/decisions/0001).
 */
const locale = (lang: Lang) => LANGS[lang].locale;

const isNative = () => Platform.OS !== "web";

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
  return isNative() || (Platform.OS === "web" && typeof speechSynthesis !== "undefined");
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
    /** Native only: the language the recogniser heard, when auto-detect is on (F22). */
    onDetected?: (lang: Lang) => void;
    detect?: boolean;
  },
): Listening {
  if (isNative()) {
    stopSpeaking();
    // The recogniser loads asynchronously; stopping before it loads cancels the session.
    let stopped = false;
    let stopSession: () => void = () => undefined;
    void loadNativeRecognizer().then((recognizer) => {
      if (!stopped) {
        stopSession = startNativeListening(lang, handlers, recognizer, undefined, handlers.detect);
      }
    });
    return {
      stop: () => {
        stopped = true;
        stopSession();
      },
    };
  }
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

/** Spoken words that stop an answer that is being read aloud (F26). Whole phrases only, in each language. */
const STOP_WORDS = new Set([
  "stop",
  "stop please",
  "please stop",
  "ఆపు",
  "ఆపండి",
  "रुको",
  "रोको",
  "बंद करो",
]);

/** True when a recognised utterance is a stop word on its own. A stop word inside a sentence does not count. */
export function matchesStopWord(utterance: string): boolean {
  const normalised = utterance
    .toLowerCase()
    .replace(/[.,!?।"“”']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return STOP_WORDS.has(normalised);
}

/**
 * Listens only for a spoken stop word while an answer is read aloud (F26, browsers only). It does not cancel speech
 * itself: the caller stops the speech in onStop. The caller starts it inside a capture session, so the microphone
 * indicator is shown. Phones without browser recognition get a no-op.
 */
export function listenForStop(lang: Lang, onStop: () => void): Listening {
  const Recognition = recognitionClass();
  if (isNative() || Recognition === undefined) {
    return { stop: () => undefined };
  }
  let wanted = true;
  const rec = new Recognition();
  rec.lang = locale(lang);
  rec.interimResults = false;
  rec.continuous = true;
  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result?.isFinal === true && matchesStopWord(result[0]?.transcript ?? "")) {
        wanted = false;
        rec.abort();
        onStop();
        return;
      }
    }
  };
  rec.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      wanted = false;
    }
  };
  // The browser ends recognition after silence; restart it while the answer is still being read.
  rec.onend = () => {
    if (wanted) {
      rec.start();
    }
  };
  rec.start();
  return {
    stop: () => {
      wanted = false;
      rec.abort();
    },
  };
}

/**
 * On a phone the installed voices are listed asynchronously, so this cannot be checked here. The engine reports a
 * missing voice through onError when speaking, and the caller's onDone still runs (see speak).
 */
export function hasVoiceFor(lang: Lang): boolean {
  if (isNative()) {
    return canSpeak();
  }
  return canSpeak() && voicesFor(lang).length > 0;
}

export function speak(text: string, lang: Lang, rate: number, onDone?: () => void): void {
  if (!canSpeak()) {
    onDone?.();
    return;
  }
  if (isNative()) {
    void Speech.stop();
    Speech.speak(text.slice(0, Speech.maxSpeechInputLength), {
      language: locale(lang),
      rate,
      onDone: () => onDone?.(),
      onStopped: () => onDone?.(),
      onError: () => onDone?.(),
    });
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
  if (isNative()) {
    void Speech.stop();
    return;
  }
  if (canSpeak()) {
    speechSynthesis.cancel();
  }
}

export function listenErrorText(code: string): string {
  if (isNative()) {
    return nativeListenErrorText(code as NativeListenError);
  }
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
