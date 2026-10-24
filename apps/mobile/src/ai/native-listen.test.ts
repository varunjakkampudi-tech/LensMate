import { LANGS } from "../ui/prefs";
import {
  nativeListenErrorText,
  NATIVE_LISTENING_ENABLED,
  startNativeListening,
  type NativeRecognizer,
} from "./native-listen";

// The tests inject their own recogniser; the real native module is not loaded.
jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: {} }));

type Event = { isFinal?: boolean; results?: { transcript: string }[]; error?: string };

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
    expect(removed.length).toBe(3);
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
