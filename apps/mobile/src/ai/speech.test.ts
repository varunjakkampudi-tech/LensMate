import * as Speech from "expo-speech";
import { LANGS } from "../ui/prefs";
import { canSpeak, listen, speak, stopSpeaking } from "./speech";

// Phones speak through the device engine; these tests stand in for it and check what LensMate asks it to do.
jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  maxSpeechInputLength: 12,
}));

const engineSpeak = Speech.speak as unknown as jest.Mock;
const engineStop = Speech.stop as unknown as jest.Mock;

type SpeakOptions = {
  language: string;
  rate: number;
  onDone: () => void;
  onStopped: () => void;
  onError: () => void;
};

function lastOptions(): SpeakOptions {
  const call = engineSpeak.mock.calls.at(-1) as [string, SpeakOptions];
  return call[1];
}

beforeEach(() => {
  engineSpeak.mockClear();
  engineStop.mockClear();
});

describe("native speech output", () => {
  it("is available on a phone", () => {
    expect(canSpeak()).toBe(true);
  });

  it("speaks with the language locale and rate, stopping anything already queued", () => {
    speak("Hello there", "en", 0.9, () => undefined);

    expect(engineStop).toHaveBeenCalledTimes(1);
    expect(engineSpeak).toHaveBeenCalledWith(
      "Hello there",
      expect.objectContaining({ language: LANGS.en.locale, rate: 0.9 }),
    );
  });

  it("clips text to the engine's input limit instead of failing", () => {
    speak("This sentence is much longer than the limit", "en", 1, () => undefined);

    expect(engineSpeak.mock.calls[0]?.[0]).toBe("This sentenc");
  });

  it("releases the caller when speech finishes, is stopped, or fails", () => {
    const onDone = jest.fn();
    speak("First", "en", 1, onDone);
    lastOptions().onDone();
    speak("Second", "en", 1, onDone);
    lastOptions().onStopped();
    speak("Third", "en", 1, onDone);
    lastOptions().onError();

    expect(onDone).toHaveBeenCalledTimes(3);
  });

  it("interrupts speech at once when asked to stop", () => {
    stopSpeaking();

    expect(engineStop).toHaveBeenCalledTimes(1);
    expect(engineSpeak).not.toHaveBeenCalled();
  });

  it("does not open a microphone: native listening reports unsupported", () => {
    const onError = jest.fn();
    const onEnd = jest.fn();

    listen("en", { onPartial: jest.fn(), onFinal: jest.fn(), onError, onEnd });

    expect(onError).toHaveBeenCalledWith("UNSUPPORTED");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
