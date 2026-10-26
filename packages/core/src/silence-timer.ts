import {
  SILENCE_TIMEOUT_MS,
  applySilenceTimeout,
  listeningSessionOf,
  type GlassesState,
  type ListeningSessionType,
} from "./glasses-state.js";

/**
 * The silence limit for translation and caption sessions (TARGET).
 * Pure: time is always passed in as milliseconds on one clock. Nothing here schedules a timer. The
 * caller decides when to check (the phone app ticks it; the simulator checks when told to).
 */
export interface SilenceTimer {
  /** The clock reading at the most recent speech, or at the start of the session if none was heard. */
  readonly lastSpeechMs: number;
}

/** Starts a silence timer at the start of a listening session. */
export function startSilenceTimer(nowMs: number): SilenceTimer {
  return { lastSpeechMs: nowMs };
}

/** Speech was heard. Resets the silence timer to zero. */
export function recordSpeech(nowMs: number): SilenceTimer {
  return { lastSpeechMs: nowMs };
}

/** Milliseconds since the last speech. A clock that reads earlier than the last speech counts as zero. */
export function silentForMs(timer: SilenceTimer, nowMs: number): number {
  return Math.max(0, nowMs - timer.lastSpeechMs);
}

/** Milliseconds left before the session stops, for the visible countdown. Never negative. */
export function silenceRemainingMs(timer: SilenceTimer, nowMs: number): number {
  return Math.max(0, SILENCE_TIMEOUT_MS - silentForMs(timer, nowMs));
}

export interface SilenceCheck {
  readonly state: GlassesState;
  /** The listening session the silence limit ended, or null when nothing ended. */
  readonly endedSession: ListeningSessionType | null;
}

/**
 * Applies the silence limit through the existing transition (applySilenceTimeout). Reports which
 * session ended, so the caller can record it. Silence below the limit, and states that are not a
 * listening session, return unchanged.
 */
export function checkSilenceTimer(
  state: GlassesState,
  timer: SilenceTimer,
  nowMs: number,
): SilenceCheck {
  const next = applySilenceTimeout(state, silentForMs(timer, nowMs));
  if (next.mode === state.mode) {
    return { state, endedSession: null };
  }
  return { state: next, endedSession: listeningSessionOf(state) };
}
