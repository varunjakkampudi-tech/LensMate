/**
 * Live-vision wiring for the camera screen. The broker transport is mocked, so no provider is called. The address is
 * read from the environment on each call, so each case sets it. Timers are faked so the interval runs without waiting.
 */
import { callBrokerVision } from "../broker-call";
import { createLiveSession, MOCK_LIVE_TEXT } from "./create-live-session";

jest.mock("../broker-call", () => {
  const actual = jest.requireActual("../broker-call");
  return { ...actual, callBrokerVision: jest.fn(), callBroker: jest.fn() };
});

const visionCall = callBrokerVision as unknown as jest.Mock;
const FRAME = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
const ORIGINAL = process.env.EXPO_PUBLIC_BROKER_BASE_URL;

beforeEach(() => {
  jest.useFakeTimers();
  visionCall.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  if (ORIGINAL === undefined) {
    delete process.env.EXPO_PUBLIC_BROKER_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_BROKER_BASE_URL = ORIGINAL;
  }
});

describe("createLiveSession", () => {
  it("returns a labelled MOCK answer and calls no AI service when no address is set", async () => {
    delete process.env.EXPO_PUBLIC_BROKER_BASE_URL;
    const session = createLiveSession(async () => FRAME);

    session.start({ intervalMs: 3000, question: "What is in front of me?" });
    await jest.advanceTimersByTimeAsync(3000);
    session.stop();

    expect(visionCall).not.toHaveBeenCalled();
    expect(session.state.source).toBe("mock");
    expect(session.state.answer?.text).toBe(MOCK_LIVE_TEXT);
    expect(session.state.answer?.costPaise).toBe(0);
  });

  it("sends the frame to the broker and reports the answer as live when an address is set", async () => {
    process.env.EXPO_PUBLIC_BROKER_BASE_URL = "https://broker.example";
    visionCall.mockResolvedValue({ text: "A red mug", source: "openrouter", costPaise: 3 });
    const session = createLiveSession(async () => FRAME);

    session.start({ intervalMs: 3000, question: "Describe" });
    await jest.advanceTimersByTimeAsync(3000);
    session.stop();

    expect(visionCall).toHaveBeenCalledTimes(1);
    expect(visionCall.mock.calls[0]?.[0]).toMatchObject({ imageDataUrl: FRAME });
    expect(session.state.source).toBe("openrouter");
    expect(session.state.answer?.text).toBe("A red mug");
  });

  it("aborts the broker request when stopped, and keeps no answer from it", async () => {
    process.env.EXPO_PUBLIC_BROKER_BASE_URL = "https://broker.example";
    visionCall.mockImplementation(() => new Promise(() => undefined));
    const session = createLiveSession(async () => FRAME);

    session.start({ intervalMs: 3000, question: "Describe" });
    await jest.advanceTimersByTimeAsync(3000);
    expect(visionCall).toHaveBeenCalledTimes(1);
    const signal = visionCall.mock.calls[0]?.[1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    session.stop();

    expect(signal.aborted).toBe(true);
    expect(session.state.phase).toBe("stopped");
    expect(session.state.answer).toBeNull();
    expect(session.state.framesAnalysed).toBe(0);
  });
});
