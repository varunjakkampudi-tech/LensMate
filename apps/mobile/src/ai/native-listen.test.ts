import { LANGS } from "../ui/prefs";
import {
  langFromTag,
  nativeListenErrorText,
  NATIVE_LISTENING_ENABLED,
  startNativeListening,
  type NativeRecognizer,
} from "./native-listen";

// The tests inject their own recogniser; the real native module is not loaded.
jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: {} }));

type Event = {
  isFinal?: boolean;
  results?: { transcript: string }[];
  error?: string;
  detectedLanguage?: string;
  confidence?: number;
};

/** A recogniser stand-in. Tests fire its events directly; nothing here touches a microphone. */
function fakeRecognizer(
  options: {
    available?: boolean;
    onDevice?: boolean;
    granted?: boolean;
    grantOnRequest?: boolean;
  } = {},
) {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const removed: string[] = [];
  const recognizer = {
    isRecognitionAvailable: () => options.available ?? true,
    supportsOnDeviceRecognition: () => options.onDevice ?? true,
    getPermissionsAsync: jest.fn(async () => ({ granted: options.granted ?? false })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: options.grantOnRequest ?? false })),
    start: jest.fn(),
    stop: jest.fn(),
    addListener: (event: string, listener: (e: Event) => void) => {
      (listeners[event] ??= []).push(listener);
      return { remove: () => removed.push(event) };
    },
  };
  const fire = (event: string, payload: Event = {}) =>
    (listeners[event] ?? []).forEach((fn) => fn(payload));
  return {
    recognizer: recognizer as unknown as NativeRecognizer & typeof recognizer,
    fire,
    removed,
  };
}

function handlers() {
  return { onPartial: jest.fn(), onFinal: jest.fn(), onError: jest.fn(), onEnd: jest.fn() };
}

describe("native speech input", () => {
  it("is switched off in this build, so it never opens the recogniser by default", () => {
    expect(NATIVE_LISTENING_ENABLED).toBe(false);
    const { recognizer } = fakeRecognizer({ granted: true });
    const h = handlers();

    startNativeListening("en", h, recognizer);

    expect(h.onError).toHaveBeenCalledWith("DISABLED");
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it("reports unavailable, not a crash, when the module is missing (Expo Go has no speech recogniser)", () => {
    const h = handlers();

    startNativeListening("en", h, undefined, true);

    expect(h.onError).toHaveBeenCalledWith("UNAVAILABLE");
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("refuses when the phone has no recogniser", () => {
    const { recognizer } = fakeRecognizer({ available: false });
    const h = handlers();

    startNativeListening("en", h, recognizer, true);

    expect(h.onError).toHaveBeenCalledWith("UNAVAILABLE");
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it("refuses rather than send speech to a cloud service when on-device recognition is missing", () => {
    const { recognizer } = fakeRecognizer({ onDevice: false, granted: true });
    const h = handlers();

    startNativeListening("te", h, recognizer, true);

    expect(h.onError).toHaveBeenCalledWith("ON_DEVICE_UNAVAILABLE");
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it("asks for permission first, and starts only after it is granted", async () => {
    const { recognizer } = fakeRecognizer({ granted: false, grantOnRequest: true });
    const h = handlers();

    startNativeListening("hi", h, recognizer, true);
    await new Promise((r) => setTimeout(r, 0));

    expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(recognizer.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: LANGS.hi.locale,
        requiresOnDeviceRecognition: true,
        continuous: false,
      }),
    );
  });

  it("reports a permission refusal and never starts", async () => {
    const { recognizer } = fakeRecognizer({ granted: false, grantOnRequest: false });
    const h = handlers();

    startNativeListening("en", h, recognizer, true);
    await new Promise((r) => setTimeout(r, 0));

    expect(h.onError).toHaveBeenCalledWith("PERMISSION_DENIED");
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it("streams partial text, then delivers the final text once and ends", async () => {
    const { recognizer, fire, removed } = fakeRecognizer({ granted: true });
    const h = handlers();
    startNativeListening("te", h, recognizer, true);
    await new Promise((r) => setTimeout(r, 0));

    fire("result", { isFinal: false, results: [{ transcript: "ఎక్కడ" }] });
    fire("result", { isFinal: true, results: [{ transcript: "ఎక్కడ నా కీస్" }] });
    fire("end");
    fire("end");

    expect(h.onPartial).toHaveBeenCalledWith("ఎక్కడ");
    expect(h.onFinal).toHaveBeenCalledTimes(1);
    expect(h.onFinal).toHaveBeenCalledWith("ఎక్కడ నా కీస్");
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    // Result, error, end and language detection are each removed once the session ends.
    expect(removed.length).toBe(4);
  });

  it("stops at once when the user taps stop, and does not report a final result afterwards", async () => {
    const { recognizer, fire } = fakeRecognizer({ granted: true });
    const h = handlers();
    const stop = startNativeListening("en", h, recognizer, true);
    await new Promise((r) => setTimeout(r, 0));

    stop();
    fire("result", { isFinal: true, results: [{ transcript: "late words" }] });

    expect(recognizer.stop).toHaveBeenCalledTimes(1);
    expect(h.onFinal).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("reports an engine error and ends the session", async () => {
    const { recognizer, fire } = fakeRecognizer({ granted: true });
    const h = handlers();
    startNativeListening("en", h, recognizer, true);
    await new Promise((r) => setTimeout(r, 0));

    fire("error", { error: "network" });

    expect(h.onError).toHaveBeenCalledWith("ENGINE_ERROR");
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("gives a clear, honest message for every refusal", () => {
    for (const code of [
      "DISABLED",
      "UNAVAILABLE",
      "ON_DEVICE_UNAVAILABLE",
      "PERMISSION_DENIED",
      "ENGINE_ERROR",
    ] as const) {
      expect(nativeListenErrorText(code).length).toBeGreaterThan(20);
    }
    expect(nativeListenErrorText("ON_DEVICE_UNAVAILABLE")).toMatch(
      /will not send your voice to a cloud service/,
    );
  });
});

describe("language auto-detect (F22)", () => {
  it("maps a BCP-47 tag to English, Telugu or Hindi, and to nothing else", () => {
    expect(langFromTag("te-IN")).toBe("te");
    expect(langFromTag("hi_IN")).toBe("hi");
    expect(langFromTag("en-GB")).toBe("en");
    expect(langFromTag("ta-IN")).toBeNull();
    expect(langFromTag("")).toBeNull();
  });

  it("asks Android to detect only English, Telugu and Hindi, and starts in the chosen language", async () => {
    const { recognizer } = fakeRecognizer({ granted: true });
    startNativeListening("en", handlers(), recognizer, true, true);
    await new Promise((r) => setTimeout(r, 0));
    expect(recognizer.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: LANGS.en.locale,
        androidIntentOptions: {
          EXTRA_ENABLE_LANGUAGE_DETECTION: true,
          EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES: [
            LANGS.en.locale,
            LANGS.te.locale,
            LANGS.hi.locale,
          ],
        },
      }),
    );
  });

  it("sends no detection options when auto-detect is off", async () => {
    const { recognizer } = fakeRecognizer({ granted: true });
    startNativeListening("te", handlers(), recognizer, true);
    await new Promise((r) => setTimeout(r, 0));
    expect(recognizer.start.mock.calls[0]?.[0]).not.toHaveProperty("androidIntentOptions");
  });

  it("reports a confident detection of a supported language, and ignores an unsure one", () => {
    const { recognizer, fire } = fakeRecognizer({ granted: true });
    const onDetected = jest.fn();
    startNativeListening("en", { ...handlers(), onDetected }, recognizer, true, true);
    fire("languagedetection", { detectedLanguage: "te-IN", confidence: 0.8 });
    fire("languagedetection", { detectedLanguage: "hi-IN", confidence: 0.2 });
    fire("languagedetection", { detectedLanguage: "ta-IN", confidence: 0.9 });
    expect(onDetected.mock.calls).toEqual([["te"]]);
  });
});
