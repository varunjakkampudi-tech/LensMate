/**
 * SEE → THINK → TALK, automated, in mock mode.
 *
 * What is real here: the session state machine, the image checks, askVision and its broker request path, and the speech
 * module's native branch. What is stand-in: the broker transport (mocked, so no provider is called), the speech engine
 * (expo-speech is mocked), and the camera (a fixed image is returned). No physical camera, microphone or speaker is
 * exercised by these tests; device checks are listed for the owner.
 */
import * as Speech from "expo-speech";
import { askVision, aiErrorText } from "../ai/assistant";
import { speak as speakText, stopSpeaking } from "../ai/speech";
import { callBrokerVision } from "../broker-call";
import { BrokerError } from "@lensmate/core";
import { checkImage, MAX_IMAGE_BYTES, SeeSession, type SeeDeps } from "./session";

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  maxSpeechInputLength: 4000,
}));
jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: {} }));
jest.mock("../broker-call", () => {
  const actual = jest.requireActual("../broker-call");
  return { ...actual, callBroker: jest.fn(), callBrokerVision: jest.fn() };
});

const engineSpeak = Speech.speak as unknown as jest.Mock;
const engineStop = Speech.stop as unknown as jest.Mock;
const visionCall = callBrokerVision as unknown as jest.Mock;

// A tiny valid JPEG data URL (header bytes only). The broker is mocked, so only the phone-side checks see it.
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

function reply(text: string, source: "mock" | "openrouter" = "mock") {
  return {
    requestId: "r",
    text,
    usage: { promptTokens: 1, completionTokens: 1 },
    costPaise: 0,
    source,
  };
}

interface Harness {
  session: SeeSession;
  releaseCamera: jest.Mock;
  capture: jest.Mock;
  requestCamera: jest.Mock;
}

function harness(overrides: Partial<SeeDeps> = {}): Harness {
  const requestCamera = jest.fn(async () => true);
  const capture = jest.fn(async () => PHOTO as string | null);
  const releaseCamera = jest.fn();
  const deps: SeeDeps = {
    requestCamera,
    capture,
    releaseCamera,
    ask: (image, question, signal) =>
      askVision(question, image, "en", false).then((a) => {
        if (signal.aborted) {
          throw new Error("aborted");
        }
        return { text: a.text, source: a.source };
      }),
    speak: (text, onDone) => speakText(text, "en", 1, onDone),
    stopSpeech: () => stopSpeaking(),
    errorText: (error) => aiErrorText(error),
    ...overrides,
  };
  return { session: new SeeSession(deps), releaseCamera, capture, requestCamera };
}

beforeEach(() => {
  jest.clearAllMocks();
  visionCall.mockResolvedValue(reply("A red mug on a wooden table."));
});

describe("SEE → THINK → TALK session (mock broker, mock speech engine)", () => {
  it("runs the whole session and labels the answer as a mock", async () => {
    const h = harness();

    await h.session.start();
    expect(h.session.state.phase).toBe("previewing");
    await h.session.takePhoto();
    expect(h.session.state.phase).toBe("photo_ready");
    await h.session.ask("What is on the table?");

    expect(h.session.state).toMatchObject({
      phase: "answered",
      answer: "A red mug on a wooden table.",
      source: "mock",
    });
    expect(visionCall).toHaveBeenCalledTimes(1);
    expect(visionCall.mock.calls[0]?.[0]).toMatchObject({ imageDataUrl: PHOTO });

    h.session.speak();
    expect(h.session.state.phase).toBe("speaking");
    expect(engineSpeak).toHaveBeenCalledWith(
      "A red mug on a wooden table.",
      expect.objectContaining({ rate: 1 }),
    );

    h.session.end();
    expect(h.session.state.phase).toBe("idle");
    expect(h.releaseCamera).toHaveBeenCalledTimes(1);
    expect(engineStop).toHaveBeenCalled();
  });

  it("returns to an answered state when speech finishes on its own", async () => {
    const h = harness();
    await h.session.start();
    await h.session.takePhoto();
    await h.session.ask("Describe it");
    h.session.speak();

    // Finish the engine's speech: the onDone callback passed to speak.
    const onDone = engineSpeak.mock.calls[0]?.[1] as { onDone: () => void };
    onDone.onDone();

    expect(h.session.state.phase).toBe("answered");
  });

  it("interrupts speech at once and keeps the answer on screen", async () => {
    const h = harness();
    await h.session.start();
    await h.session.takePhoto();
    await h.session.ask("Describe it");
    h.session.speak();

    h.session.interrupt();

    expect(engineStop).toHaveBeenCalled();
    expect(h.session.state).toMatchObject({
      phase: "answered",
      answer: "A red mug on a wooden table.",
    });
  });

  it("reports a refused camera permission and never captures", async () => {
    const h = harness({ requestCamera: async () => false });

    await h.session.start();
    await h.session.takePhoto();

    expect(h.session.state.phase).toBe("permission_denied");
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("rejects an invalid image before any broker call", async () => {
    const h = harness({ capture: async () => "data:text/plain;base64,aGk=" });

    await h.session.start();
    await h.session.takePhoto();

    expect(h.session.state).toMatchObject({ phase: "error" });
    expect(visionCall).not.toHaveBeenCalled();
  });

  it("rejects an oversize photo before any broker call", async () => {
    const big = "data:image/jpeg;base64," + "A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8);
    const h = harness({ capture: async () => big });

    await h.session.start();
    await h.session.takePhoto();

    expect(h.session.state).toMatchObject({
      phase: "error",
      message: expect.stringMatching(/too large/),
    });
    expect(visionCall).not.toHaveBeenCalled();
  });

  it("shows a clear message when the network fails, and does not invent an answer", async () => {
    visionCall.mockRejectedValue(new TypeError("Network request failed"));
    const h = harness();

    await h.session.start();
    await h.session.takePhoto();
    await h.session.ask("What is it?");

    expect(h.session.state.phase).toBe("error");
    expect(h.session.state).not.toMatchObject({ answer: expect.anything() });
  });

  it("shows the broker's refusal in plain words", async () => {
    visionCall.mockRejectedValue(new BrokerError("BUDGET_EXHAUSTED", "PROVIDER_ERROR", false));
    const h = harness();

    await h.session.start();
    await h.session.takePhoto();
    await h.session.ask("What is it?");

    expect(h.session.state).toMatchObject({ phase: "error" });
  });

  it("cancels a request in progress and discards its answer", async () => {
    let release: (value: unknown) => void = () => undefined;
    visionCall.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const h = harness();

    await h.session.start();
    await h.session.takePhoto();
    const pending = h.session.ask("What is it?");
    h.session.cancel();
    release(reply("Late answer that must be ignored"));
    await pending;

    expect(h.session.state.phase).toBe("previewing");
    expect(engineStop).toHaveBeenCalled();
  });

  it("ends cleanly when ended twice and returns to idle", async () => {
    const h = harness();
    await h.session.start();

    h.session.end();
    h.session.end();

    expect(h.releaseCamera).toHaveBeenCalledTimes(2);
    expect(h.session.state.phase).toBe("idle");
  });
});

describe("image checks", () => {
  it("accepts a JPEG or PNG within the limit", () => {
    expect(checkImage(PHOTO)).toMatchObject({ ok: true });
    expect(checkImage("data:image/png;base64,iVBORw0KGgo=")).toMatchObject({ ok: true });
  });

  it("refuses empty, non-image and oversize data", () => {
    expect(checkImage(null)).toEqual({ ok: false, reason: "EMPTY" });
    expect(checkImage("data:image/gif;base64,R0lGOD")).toEqual({
      ok: false,
      reason: "NOT_AN_IMAGE",
    });
    expect(checkImage("not a data url")).toEqual({ ok: false, reason: "NOT_AN_IMAGE" });
    expect(checkImage("data:image/jpeg;base64,")).toEqual({ ok: false, reason: "NOT_AN_IMAGE" });
    expect(
      checkImage("data:image/jpeg;base64," + "A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)),
    ).toEqual({ ok: false, reason: "TOO_LARGE" });
  });
});
