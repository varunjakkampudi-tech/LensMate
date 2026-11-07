import { LANGS, type Lang } from "../ui/prefs";

/**
 * Loads the recogniser only when it is needed. The package is a custom native module: Expo Go does not contain it, and
 * importing it there throws at load time, which would stop the whole app from starting. A failed load means
 * "unavailable", and the caller shows that message.
 */
export async function loadNativeRecognizer(): Promise<NativeRecognizer | undefined> {
  try {
    const mod = await import("expo-speech-recognition");
    return mod.ExpoSpeechRecognitionModule as unknown as NativeRecognizer;
  } catch {
    return undefined;
  }
}

/**
 * Native speech input (owner decision, 2026-10-24: conditional approval of expo-speech-recognition 58.0.0).
 *
 * It stays OFF in this build. Turn it on only after on-device recognition is verified on a real iPhone and an Android
 * phone (docs/decisions/0001). Even when on, it requests on-device recognition only: if the device cannot do that, it
 * refuses and does not fall back to cloud transcription. The package's default is network recognition, so the option
 * is always set explicitly here.
 */
export const NATIVE_LISTENING_ENABLED = false;

export type NativeListenError =
  "DISABLED" | "UNAVAILABLE" | "ON_DEVICE_UNAVAILABLE" | "PERMISSION_DENIED" | "ENGINE_ERROR";

export interface NativeListenHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: NativeListenError) => void;
  onEnd: () => void;
  /** Called when the recogniser reports the language that was spoken (auto-detect mode only). */
  onDetected?: (lang: Lang) => void;
}

/** The languages auto-detect can pick: English, Telugu and Hindi (F22). */
const AUTO_DETECT_LANGS: readonly Lang[] = ["en", "te", "hi"];

/** Detections below this confidence are ignored, so an unsure guess never changes the language. */
const MIN_DETECTION_CONFIDENCE = 0.5;

/** Maps a BCP-47 tag such as "te-IN" to one of the auto-detect languages, or null for any other language. */
export function langFromTag(tag: string): Lang | null {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return AUTO_DETECT_LANGS.find((lang) => lang === base) ?? null;
}

/** The subset of the package's module this file uses. Injected in tests. */
export interface NativeRecognizer {
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    requiresOnDeviceRecognition: boolean;
    androidIntentOptions?: {
      EXTRA_ENABLE_LANGUAGE_DETECTION: boolean;
      EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES: string[];
    };
  }): void;
  stop(): void;
  addListener(
    event: "result" | "error" | "end" | "languagedetection",
    listener: (event: {
      isFinal?: boolean;
      results?: { transcript: string }[];
      error?: string;
      detectedLanguage?: string;
      confidence?: number;
    }) => void,
  ): { remove(): void };
}

const DEFAULT_LOCALES: Record<Lang, string> = Object.fromEntries(
  Object.entries(LANGS).map(([code, lang]) => [code, lang.locale]),
) as Record<Lang, string>;

/**
 * Starts one user-controlled listening session. It is the only place that starts the recogniser. Nothing listens in the
 * background, and the session ends on stop, on a final result, or on an error.
 */
export function startNativeListening(
  lang: Lang,
  handlers: NativeListenHandlers,
  recognizer: NativeRecognizer | undefined,
  enabled: boolean = NATIVE_LISTENING_ENABLED,
  detect = false,
): () => void {
  const refuse = (code: NativeListenError) => {
    handlers.onError(code);
    handlers.onEnd();
    return () => undefined;
  };
  if (!enabled) {
    return refuse("DISABLED");
  }
  if (recognizer === undefined || !recognizer.isRecognitionAvailable()) {
    return refuse("UNAVAILABLE");
  }
  if (!recognizer.supportsOnDeviceRecognition()) {
    return refuse("ON_DEVICE_UNAVAILABLE");
  }

  let finalText = "";
  let finished = false;
  const subscriptions = [
    recognizer.addListener("result", (event) => {
      const text = event.results?.[0]?.transcript ?? "";
      if (event.isFinal === true) {
        finalText = text;
      } else {
        handlers.onPartial(text);
      }
    }),
    recognizer.addListener("languagedetection", (event) => {
      const detected = langFromTag(event.detectedLanguage ?? "");
      if (detected !== null && (event.confidence ?? 0) >= MIN_DETECTION_CONFIDENCE) {
        handlers.onDetected?.(detected);
      }
    }),
    recognizer.addListener("error", () => {
      finish("ENGINE_ERROR");
    }),
    recognizer.addListener("end", () => {
      finish(undefined);
    }),
  ];

  function finish(error: NativeListenError | undefined) {
    if (finished) {
      return;
    }
    finished = true;
    subscriptions.forEach((s) => s.remove());
    if (error !== undefined) {
      handlers.onError(error);
    } else if (finalText.trim() !== "") {
      handlers.onFinal(finalText.trim());
    }
    handlers.onEnd();
  }

  void (async () => {
    let granted = (await recognizer.getPermissionsAsync()).granted;
    if (!granted) {
      granted = (await recognizer.requestPermissionsAsync()).granted;
    }
    if (!granted) {
      finish("PERMISSION_DENIED");
      return;
    }
    recognizer.start({
      lang: DEFAULT_LOCALES[lang],
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: true,
      // Android only: the recogniser reports the spoken language, limited to the three languages. iOS has no such
      // option, so there the chosen language is used and no detection is reported.
      ...(detect
        ? {
            androidIntentOptions: {
              EXTRA_ENABLE_LANGUAGE_DETECTION: true,
              EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES: AUTO_DETECT_LANGS.map(
                (l) => DEFAULT_LOCALES[l],
              ),
            },
          }
        : {}),
    });
  })().catch(() => finish("ENGINE_ERROR"));

  return () => {
    recognizer.stop();
    finish(undefined);
  };
}

export function nativeListenErrorText(code: NativeListenError): string {
  switch (code) {
    case "DISABLED":
      return "Speech input on this phone is not switched on in this build yet. Type your question instead.";
    case "UNAVAILABLE":
      return "This phone's speech recogniser is not available. Type your question instead.";
    case "ON_DEVICE_UNAVAILABLE":
      return "This phone cannot recognise speech on the device, so LensMate will not send your voice to a cloud service. Type instead.";
    case "PERMISSION_DENIED":
      return "Microphone or speech permission was refused. Allow it in Settings, then try again.";
    case "ENGINE_ERROR":
      return "Listening stopped because the speech engine failed. Try again.";
  }
}
