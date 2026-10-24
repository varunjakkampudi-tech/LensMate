import type { CaptureSessionType } from "./capture-indicator.js";

/**
 * Gesture precedence and session rules for the P-1 scope (v9 section 5.0 and section 21).
 *
 * Each gesture is consumed by the first state that claims it, in this order:
 * cutoff, speaking, translation or caption, push-to-talk, idle.
 * Companion mode, walk, sound alert, helper call and emergency are outside P-1 and have no path here.
 * Any gesture or mode this file does not know is ignored (fails closed).
 */
export type GlassesMode = "IDLE" | "PUSH_TO_TALK" | "TRANSLATION" | "CAPTION" | "CUTOFF";

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

export type ListeningSessionType = "TRANSLATION" | "CAPTION";

export interface ListeningSessionStart {
  readonly state: GlassesState;
  readonly accepted: boolean;
  /** Spoken at the start of a translation session so the other person knows (G15). Null otherwise. */
  readonly announcement: string | null;
}

/** Spoken when a translation session starts (v9 section 5.3, G15, checklist item 3). */
export const TRANSLATION_START_ANNOUNCEMENT =
  "Translation on. This conversation is being listened to for translation";

/** A translation or caption session stops after this much silence (v9 section 5.3, section 21; TARGET). */
export const SILENCE_TIMEOUT_MS = 2 * 60 * 1000;

/** Speech stops within this time of a press (v9 G19; TARGET, not a measured value). */
export const SPEECH_STOP_TARGET_MS = 500;

/** Voice phrases the glasses act on. Only inside a listening session the user started (v9 C02). */
export type VoiceCommand =
  "START_TRANSLATION" | "STOP_TRANSLATION" | "START_CAPTIONS" | "STOP_CAPTIONS";

export interface VoiceCommandResult {
  readonly state: GlassesState;
  readonly accepted: boolean;
  /** Spoken when a translation session starts (G15). Null otherwise. */
  readonly announcement: string | null;
}

export const IDLE_STATE: GlassesState = { mode: "IDLE", speaking: false };

/** A gesture from the glasses. Taps and holds are never consumed by a session that does not claim them. */
export function onGesture(state: GlassesState, gesture: Gesture): GlassesTransition {
  if (state.mode === "CUTOFF") {
    return unchanged(state);
  }
  if (state.speaking) {
    if (gesture === "PRESS") {
      return { state: { mode: state.mode, speaking: false }, effect: "STOP_SPEECH" };
    }
    return unchanged(state);
  }
  switch (state.mode) {
    case "TRANSLATION":
    case "CAPTION":
      return unchanged(state);
    case "PUSH_TO_TALK":
      return onPushToTalkGesture(state, gesture);
    case "IDLE":
      return onIdleGesture(state, gesture);
    default:
      return unchanged(state);
  }
}

/**
 * Start of a session from the phone app or an in-session voice command. Gestures cannot start these.
 * Only translation and caption can be started this way; push-to-talk and photo start by gesture only.
 */
export function startListeningSession(
  state: GlassesState,
  type: ListeningSessionType,
): ListeningSessionStart {
  if (state.mode !== "IDLE") {
    return { state, accepted: false, announcement: null };
  }
  return {
    state: { mode: type, speaking: state.speaking },
    accepted: true,
    announcement: type === "TRANSLATION" ? TRANSLATION_START_ANNOUNCEMENT : null,
  };
}

/** Stop of a translation or caption session by the phone app or voice. */
export function stopListeningSession(state: GlassesState): GlassesState {
  if (state.mode === "TRANSLATION" || state.mode === "CAPTION") {
    return { mode: "IDLE", speaking: state.speaking };
  }
  return state;
}

/**
 * The listening session a state is running, or null. Push-to-talk is a listening state too, but it is
 * not a translation or caption session.
 */
export function listeningSessionOf(state: GlassesState): ListeningSessionType | null {
  if (state.mode === "TRANSLATION") {
    return "TRANSLATION";
  }
  if (state.mode === "CAPTION") {
    return "CAPTION";
  }
  return null;
}

/**
 * A voice command (v9 5.3, 21, C02). Voice is heard only inside a listening session the user started:
 * a push-to-talk hold, or a translation or caption session that is already running. A voice start from
 * idle is refused, because that would mean listening in the background. A voice start during a hold or
 * another session switches to the new session. A voice stop works only on the session it names.
 */
export function onVoiceCommand(state: GlassesState, command: VoiceCommand): VoiceCommandResult {
  if (state.mode === "CUTOFF") {
    return refusedVoice(state);
  }
  switch (command) {
    case "START_TRANSLATION":
      return startByVoice(state, "TRANSLATION");
    case "START_CAPTIONS":
      return startByVoice(state, "CAPTION");
    case "STOP_TRANSLATION":
      return stopByVoice(state, "TRANSLATION");
    case "STOP_CAPTIONS":
      return stopByVoice(state, "CAPTION");
  }
}

/**
 * Ends a translation or caption session once the time since the last speech reaches the silence limit.
 * The caller measures the silence. Other states are unchanged.
 */
export function applySilenceTimeout(state: GlassesState, silentMs: number): GlassesState {
  if (
    (state.mode === "TRANSLATION" || state.mode === "CAPTION") &&
    silentMs >= SILENCE_TIMEOUT_MS
  ) {
    return { mode: "IDLE", speaking: state.speaking };
  }
  return state;
}

/** Thermal, battery or privacy cutoff. Nothing overrides it (precedence item 1). */
export function applyCutoff(): GlassesState {
  return { mode: "CUTOFF", speaking: false };
}

/** Speech has started on the glasses (output the user can stop with one press). */
export function speechStarted(state: GlassesState): GlassesState {
  return state.mode === "CUTOFF" ? state : { mode: state.mode, speaking: true };
}

/** Speech finished on its own. Without this, the glasses would ignore taps after any speech. */
export function speechEnded(state: GlassesState): GlassesState {
  return state.speaking ? { mode: state.mode, speaking: false } : state;
}

/** Whether the camera or microphone is in use for a session. The indicator must be on whenever this is true. */
export function isCapturing(state: GlassesState): boolean {
  return state.mode === "PUSH_TO_TALK" || state.mode === "TRANSLATION" || state.mode === "CAPTION";
}

/**
 * The indicator session a gesture effect opens (G6, section 21). Photo and visual question captures
 * run with the indicator on for the capture. Push-to-talk runs with it on while held.
 */
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

function startByVoice(state: GlassesState, type: ListeningSessionType): VoiceCommandResult {
  const inUserStartedListening =
    state.mode === "PUSH_TO_TALK" || state.mode === "TRANSLATION" || state.mode === "CAPTION";
  if (!inUserStartedListening || state.mode === type) {
    return refusedVoice(state);
  }
  return {
    state: { mode: type, speaking: state.speaking },
    accepted: true,
    announcement: type === "TRANSLATION" ? TRANSLATION_START_ANNOUNCEMENT : null,
  };
}

function stopByVoice(state: GlassesState, type: ListeningSessionType): VoiceCommandResult {
  if (state.mode !== type) {
    return refusedVoice(state);
  }
  return { state: { mode: "IDLE", speaking: state.speaking }, accepted: true, announcement: null };
}

function refusedVoice(state: GlassesState): VoiceCommandResult {
  return { state, accepted: false, announcement: null };
}

function onPushToTalkGesture(state: GlassesState, gesture: Gesture): GlassesTransition {
  if (gesture === "RELEASE") {
    return { state: IDLE_STATE, effect: "SEND_QUESTION" };
  }
  if (gesture === "PRESS") {
    return { state: IDLE_STATE, effect: "CANCEL_QUESTION" };
  }
  return unchanged(state);
}

function onIdleGesture(state: GlassesState, gesture: Gesture): GlassesTransition {
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
    default:
      return unchanged(state);
  }
}

function unchanged(state: GlassesState): GlassesTransition {
  return { state, effect: "NONE" };
}
