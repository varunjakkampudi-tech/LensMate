import { askVision, RequestCancelled } from "../ai/assistant";
import { readBrokerConfig } from "../broker-config";
import { LiveVisionSession, type LiveAnswer } from "./live-session";

/**
 * Builds the live-vision controller for the camera screen. Frames come from the live camera preview. Analysis goes through
 * the broker when an address is configured. With no address, the answer is a MOCK result that says no AI was called.
 * It describes nothing the camera saw, so it never pretends to be an observation.
 */
export const MOCK_LIVE_TEXT =
  "Mock result: a camera frame was captured, but no AI service was called, so nothing was described.";

export function createLiveSession(captureFrame: () => Promise<string | null>): LiveVisionSession {
  return new LiveVisionSession({
    captureFrame,
    analyse: async (frame, question, signal): Promise<LiveAnswer> => {
      if (!readBrokerConfig().ok) {
        if (signal.aborted) {
          throw new RequestCancelled();
        }
        return { text: MOCK_LIVE_TEXT, source: "mock", costPaise: 0 };
      }
      const answer = await askVision(question, frame, "en", false, signal);
      return { text: answer.text, source: answer.source, costPaise: answer.costPaise };
    },
    now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}
