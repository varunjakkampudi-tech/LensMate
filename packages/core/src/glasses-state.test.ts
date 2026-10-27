import {
  IDLE_STATE,
  applyCutoff,
  captureSessionForEffect,
  isCapturing,
  onGesture,
  speechEnded,
  speechStarted,
} from "./glasses-state.js";

describe("glasses capture gestures", () => {
  it("captures a photo on one tap and starts a visual question on two taps", () => {
    expect(onGesture(IDLE_STATE, "SINGLE_TAP").effect).toBe("CAPTURE_PHOTO");
    expect(onGesture(IDLE_STATE, "DOUBLE_TAP").effect).toBe("CAPTURE_VISUAL_QUESTION");
  });

  it("starts push-to-talk on hold, sends on release, and cancels on press", () => {
    const held = onGesture(IDLE_STATE, "HOLD");
    expect(held).toEqual({
      state: { mode: "PUSH_TO_TALK", speaking: false },
      effect: "START_PUSH_TO_TALK",
    });
    expect(onGesture(held.state, "RELEASE")).toEqual({
      state: IDLE_STATE,
      effect: "SEND_QUESTION",
    });
    expect(onGesture(held.state, "PRESS")).toEqual({
      state: IDLE_STATE,
      effect: "CANCEL_QUESTION",
    });
    expect(isCapturing(held.state)).toBe(true);
  });

  it("stops speech on press and permits capture again after speech ends", () => {
    const speaking = speechStarted(IDLE_STATE);
    expect(onGesture(speaking, "PRESS")).toEqual({ state: IDLE_STATE, effect: "STOP_SPEECH" });
    expect(onGesture(speechEnded(speaking), "SINGLE_TAP").effect).toBe("CAPTURE_PHOTO");
  });

  it("locks all capture and speech behavior after a cutoff", () => {
    const cutoff = applyCutoff();
    expect(onGesture(cutoff, "SINGLE_TAP")).toEqual({ state: cutoff, effect: "NONE" });
    expect(speechStarted(cutoff)).toBe(cutoff);
    expect(isCapturing(cutoff)).toBe(false);
  });

  it("maps only real capture actions to the recording indicator", () => {
    expect(captureSessionForEffect("CAPTURE_PHOTO")).toBe("PHOTO_QUESTION");
    expect(captureSessionForEffect("CAPTURE_VISUAL_QUESTION")).toBe("PHOTO_QUESTION");
    expect(captureSessionForEffect("START_PUSH_TO_TALK")).toBe("PUSH_TO_TALK");
    expect(captureSessionForEffect("SEND_QUESTION")).toBeNull();
  });
});
