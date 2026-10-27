/**
 * Capture and ask, automated, in mock mode.
 *
 * Real: the session state machine, the image checks, askVision and its broker request path (through the mocked
 * transport), and the speech module's native branch. Stand-in: the broker transport (mocked, so no provider is called),
 * the speech engine (expo-speech is mocked) and the camera (a fixed image). No physical camera, microphone or speaker is
 * exercised by these tests; device checks are listed for the owner.
 */
import * as Speech from "expo-speech";
import { BrokerError } from "@lensmate/core";
import { askVision, aiErrorText } from "../ai/assistant";
import { speak as speakText, stopSpeaking } from "../ai/speech";
import { callBrokerVision } from "../broker-call";
import { CaptureSession, checkImage, MAX_IMAGE_BYTES, type CaptureDeps } from "./session";

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
const OVERSIZE = "data:image/jpeg;base64," + "A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8);

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
  session: CaptureSession;
  startCamera: jest.Mock;
  releaseCamera: jest.Mock;
  capture: jest.Mock;
}

function harness(overrides: Partial<CaptureDeps> = {}): Harness {
  const startCamera = jest.fn();
  const releaseCamera = jest.fn();
  const capture = jest.fn(async () => PHOTO as string | null);
  const deps: CaptureDeps = {
    startCamera,
    capture,
    releaseCamera,
    ask: (image, question, signal) =>
      askVision(question, image, "en", false).then((a) => {
        if (signal.aborted) {
          throw new Error("aborted");
        }
        return { text: a.text, source: a.source, costPaise: a.costPaise, latencyMs: a.latencyMs };
      }),
    speak: (text, onDone) => speakText(text, "en", 1, onDone),
    stopSpeech: () => stopSpeaking(),
    errorText: (error) => aiErrorText(error),
    ...overrides,
  };
  return { session: new CaptureSession(deps), startCamera, releaseCamera, capture };
}

beforeEach(() => {
  jest.clearAllMocks();
  visionCall.mockResolvedValue(reply("A red mug on a wooden table."));
});

describe("capture and ask session (mock broker, mock speech engine)", () => {
  it("runs the whole session and labels the answer as a mock", async () => {
    const h = harness();

    h.session.start();
    expect(h.session.state.phase).toBe("previewing");
    expect(h.startCamera).toHaveBeenCalledTimes(1);

    await h.session.takePhoto();
    expect(h.session.state).toMatchObject({ phase: "photo_ready", photo: PHOTO });
    expect(h.releaseCamera).toHaveBeenCalledTimes(1);

    await h.session.ask("What is on the table?");
    expect(h.session.state).toMatchObject({
      phase: "answered",
      answer: { text: "A red mug on a wooden table.", source: "mock" },
    });
    expect(visionCall.mock.calls[0]?.[0]).toMatchObject({ imageDataUrl: PHOTO });

    h.session.speak();
    expect(h.session.state.phase).toBe("speaking");
    expect(engineSpeak).toHaveBeenCalledWith(
      "A red mug on a wooden table.",
      expect.objectContaining({ rate: 1 }),
    );
  });

  it("returns to answered when speech finishes on its own", async () => {
    const h = harness();
    h.session.start();
    await h.session.takePhoto();
    await h.session.ask("Describe it");
    h.session.speak();

    const options = engineSpeak.mock.calls[0]?.[1] as { onDone: () => void };
    options.onDone();

    expect(h.session.state.phase).toBe("answered");
  });

  it("interrupts speech at once and keeps the answer on screen", async () => {
    const h = harness();
    h.session.start();
    await h.session.takePhoto();
    await h.session.ask("Describe it");
    h.session.speak();

    h.session.interrupt();

    expect(engineStop).toHaveBeenCalled();
    expect(h.session.state).toMatchObject({
      phase: "answered",
      answer: { text: "A red mug on a wooden table." },
    });
  });

  it("asks a follow-up about the same photo, keeping the photo", async () => {
    const h = harness();
    h.session.start();
    await h.session.takePhoto();
    await h.session.ask("What colour is it?");
    await h.session.ask("How big is it?");

    expect(visionCall).toHaveBeenCalledTimes(2);
    expect(visionCall.mock.calls[1]?.[0]).toMatchObject({ imageDataUrl: PHOTO });
    expect(h.session.state.photo).toBe(PHOTO);
  });

  it("cancels a question in progress and discards its answer", async () => {
    let release: (value: unknown) => void = () => undefined;
    visionCall.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const h = harness();
    h.session.start();
    await h.session.takePhoto();

    const pending = h.session.ask("What is it?");
    h.session.cancelRequest();
    release(reply("Late answer that must be ignored"));
    await pending;

    expect(h.session.state).toMatchObject({ phase: "photo_ready", answer: null });
  });

  it("stops the camera when the user cancels the preview, and releases it once", () => {
    const h = harness();
    h.session.start();

    h.session.cancelCamera();
    h.session.cancelCamera();

    expect(h.releaseCamera).toHaveBeenCalledTimes(1);
    expect(h.session.state.phase).toBe("idle");
  });

  it("releases the camera and speech when the screen is left, keeping the photo and answer", async () => {
    const h = harness();
    h.session.start();
    await h.session.takePhoto();
    await h.session.ask("Describe it");
    h.session.speak();

    h.session.end();

    expect(engineStop).toHaveBeenCalled();
    expect(h.session.state).toMatchObject({ phase: "answered", photo: PHOTO });
  });

  it("ends cleanly when ended twice, without releasing the camera twice", () => {
    const h = harness();
    h.session.start();

    h.session.end();
    h.session.end();

    expect(h.releaseCamera).toHaveBeenCalledTimes(1);
  });

  it("reports a refused camera permission and keeps any photo already held", async () => {
    const h = harness();
    h.session.start();
    await h.session.takePhoto();
    h.session.start();
    h.session.reportCameraError("Camera permission was refused. You can upload a photo instead.");

    expect(h.session.state).toMatchObject({ phase: "photo_ready", photo: PHOTO });
    expect(h.session.state.message).toMatch(/refused/);
    expect(h.releaseCamera).toHaveBeenCalled();
  });

  it("reports a camera that is not ready, and keeps the camera off", async () => {
    const h = harness({ capture: async () => null });
    h.session.start();

    await h.session.takePhoto();

    expect(h.session.state).toMatchObject({
      phase: "idle",
      message: "The camera was not ready. Try again.",
    });
    expect(h.releaseCamera).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid image before any broker call, and keeps the previous photo", async () => {
    const h = harness();
    h.session.start();
    await h.session.takePhoto();

    expect(h.session.setPhoto("data:text/plain;base64,aGk=")).toBe(false);

    expect(h.session.state).toMatchObject({
      photo: PHOTO,
      message: "That file could not be read as an image.",
    });
    expect(visionCall).not.toHaveBeenCalled();
  });

  it("rejects an oversize photo before any broker call", async () => {
    const h = harness();

    expect(h.session.setPhoto(OVERSIZE)).toBe(false);

    expect(h.session.state.message).toMatch(/too large/);
    expect(h.session.state.photo).toBeNull();
    expect(visionCall).not.toHaveBeenCalled();
  });

  it("shows a clear error on network failure and does not invent an answer", async () => {
    visionCall.mockRejectedValue(new TypeError("Network request failed"));
    const h = harness();
    h.session.setPhoto(PHOTO);

    await h.session.ask("What is it?");

    expect(h.session.state).toMatchObject({ phase: "error", photo: PHOTO, answer: null });
    expect(h.session.state.message).toBeTruthy();
  });

  it("shows the broker's refusal in plain words", async () => {
    visionCall.mockRejectedValue(new BrokerError("BUDGET_EXHAUSTED", "PROVIDER_ERROR", false));
    const h = harness();
    h.session.setPhoto(PHOTO);

    await h.session.ask("What is it?");

    expect(h.session.state.phase).toBe("error");
  });

  it("removes the photo and its answer", async () => {
    const h = harness();
    h.session.setPhoto(PHOTO);
    await h.session.ask("What is it?");

    h.session.removePhoto();

    expect(h.session.state).toMatchObject({ phase: "idle", photo: null, answer: null });
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
    expect(checkImage(OVERSIZE)).toEqual({ ok: false, reason: "TOO_LARGE" });
  });
});
