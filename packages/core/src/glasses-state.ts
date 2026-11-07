import type { CaptureSessionType } from "./capture-indicator.js";

/** Minimal glasses interaction state for photo capture, push-to-talk, and privacy cutoff. */
export type GlassesMode = "IDLE" | "PUSH_TO_TALK" | "CUTOFF";

export interface GlassesState {
  readonly mode: GlassesMode;
  readonly speaking: boolean;
}

export type Gesture = "SINGLE_TAP" | "DOUBLE_TAP" | "HOLD" | "RELEASE" | "PRESS";

export type GlassesEffect =
  | "NONE"
  | "CAPTURE_PHOTO"
  | "CAPTURE_VISUAL_QUESTION"
  | "START_PUSH_TO_TALK"
  | "SEND_QUESTION"
  | "CANCEL_QUESTION"
  | "STOP_SPEECH";

export interface GlassesTransition {
  readonly state: GlassesState;
  readonly effect: GlassesEffect;
}

export const IDLE_STATE: GlassesState = { mode: "IDLE", speaking: false };

/** A gesture from the glasses. Capture is disabled after a thermal, battery, or privacy cutoff. */
export function onGesture(state: GlassesState, gesture: Gesture): GlassesTransition {
  if (state.mode === "CUTOFF") {
    return unchanged(state);
  }
  if (state.speaking) {
    return gesture === "PRESS"
      ? { state: { mode: state.mode, speaking: false }, effect: "STOP_SPEECH" }
      : unchanged(state);
  }
  if (state.mode === "PUSH_TO_TALK") {
    if (gesture === "RELEASE") return { state: IDLE_STATE, effect: "SEND_QUESTION" };
    if (gesture === "PRESS") return { state: IDLE_STATE, effect: "CANCEL_QUESTION" };
    return unchanged(state);
  }
  switch (gesture) {
    case "SINGLE_TAP":
      return { state, effect: "CAPTURE_PHOTO" };
    case "DOUBLE_TAP":
      return { state, effect: "CAPTURE_VISUAL_QUESTION" };
    case "HOLD":
      return { state: { mode: "PUSH_TO_TALK", speaking: false }, effect: "START_PUSH_TO_TALK" };
    case "RELEASE":
    case "PRESS":
      return unchanged(state);
  }
}

/** Thermal, battery, or privacy cutoff. Nothing overrides it. */
export function applyCutoff(): GlassesState {
  return { mode: "CUTOFF", speaking: false };
}

/** Speech has started on the glasses (output the user can stop with one press). */
export function speechStarted(state: GlassesState): GlassesState {
  return state.mode === "CUTOFF" ? state : { mode: state.mode, speaking: true };
}

/** Speech finished on its own. */
export function speechEnded(state: GlassesState): GlassesState {
  return state.speaking ? { mode: state.mode, speaking: false } : state;
}

/** Whether the microphone is active for push-to-talk. */
export function isCapturing(state: GlassesState): boolean {
  return state.mode === "PUSH_TO_TALK";
}

/** The indicator session a gesture effect opens. */
export function captureSessionForEffect(effect: GlassesEffect): CaptureSessionType | null {
  switch (effect) {
    case "CAPTURE_PHOTO":
    case "CAPTURE_VISUAL_QUESTION":
      return "PHOTO_QUESTION";
    case "START_PUSH_TO_TALK":
      return "PUSH_TO_TALK";
    default:
      return null;
  }
}

function unchanged(state: GlassesState): GlassesTransition {
  return { state, effect: "NONE" };
}
