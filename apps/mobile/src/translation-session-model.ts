import { recordSpeech, startSilenceTimer, type SilenceTimer } from "@lensmate/core";
import type { SessionEndCause, SimulatorEvent } from "@lensmate/simulator";
import { STRINGS } from "./strings";

const T = STRINGS.translationSession;

/** The two listening sessions the phone can start (v9 section 21). */
export type ListeningKind = "TRANSLATION" | "CAPTION";

/**
 * What the translation and caption screen shows. Built only from what the glasses report: the indicator
 * (on the link) and the session events (the simulator's event feed). Nothing here is estimated.
 */
export interface TranslationSessionModel {
  /** The listening session the indicator reports, or null. Push-to-talk and photo are not listening sessions. */
  readonly session: ListeningKind | null;
  readonly indicatorOn: boolean;
  readonly indicatorReason: string;
  /** The last announcement the glasses made (G15). */
  readonly announcement: string | null;
  /** Caption text received during the running session. Kept only in memory; not stored. */
  readonly captions: readonly string[];
  /** The silence timer of the running session, or null when no session runs. */
  readonly silence: SilenceTimer | null;
  /** Why the most recent session ended, or null if none has ended yet. */
  readonly endedBy: SessionEndCause | null;
}

export const INITIAL_TRANSLATION_MODEL: TranslationSessionModel = {
  session: null,
  indicatorOn: false,
  indicatorReason: "INDICATOR_REASON_IDLE",
  announcement: null,
  captions: [],
  silence: null,
  endedBy: null,
};

export type TranslationAction =
  | { readonly type: "INDICATOR"; readonly on: boolean; readonly reason: string }
  | { readonly type: "EVENT"; readonly event: SimulatorEvent };

export function reduceTranslation(
  model: TranslationSessionModel,
  action: TranslationAction,
): TranslationSessionModel {
  if (action.type === "INDICATOR") {
    return applyIndicator(model, action.on, action.reason);
  }
  return applyEvent(model, action.event);
}

function applyIndicator(
  model: TranslationSessionModel,
  on: boolean,
  reason: string,
): TranslationSessionModel {
  const session = on ? listeningKindForReason(reason) : null;
  if (session === null) {
    // Off, or a capture that is not a listening session. No silence countdown applies to either.
    return { ...model, session: null, indicatorOn: on, indicatorReason: reason, silence: null };
  }
  return { ...model, session, indicatorOn: true, indicatorReason: reason };
}

function applyEvent(
  model: TranslationSessionModel,
  event: SimulatorEvent,
): TranslationSessionModel {
  switch (event.kind) {
    case "SESSION_STARTED":
      return {
        ...model,
        captions: [],
        silence: startSilenceTimer(event.atMs),
        endedBy: null,
      };
    case "SESSION_ENDED":
      return { ...model, silence: null, endedBy: event.cause };
    case "ANNOUNCEMENT":
      return { ...model, announcement: event.text };
    case "SPEECH_ACTIVITY":
      return model.silence === null ? model : { ...model, silence: recordSpeech(event.atMs) };
    case "CAPTION_TEXT":
      return model.session === null
        ? model
        : { ...model, captions: [...model.captions, event.text] };
    default:
      return model;
  }
}

function listeningKindForReason(reason: string): ListeningKind | null {
  if (reason === "INDICATOR_REASON_TRANSLATION") {
    return "TRANSLATION";
  }
  if (reason === "INDICATOR_REASON_CAPTION") {
    return "CAPTION";
  }
  return null;
}

/** The countdown text, rounded up to whole seconds so it reads 2:00 at the start and 0:01 just before the stop. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

/** Text for an error the glasses reported in an acknowledgement. */
export function ackErrorText(code: string): string {
  if (code === "ERROR_CODE_CAPTURE_ACTIVE") {
    return T.errors.busy;
  }
  if (code === "ERROR_CODE_MALFORMED") {
    return T.errors.malformed;
  }
  return T.errors.failed;
}

/** Text for the indicator, shown as words so it is not only a colour (Standards section 3). */
export function indicatorText(model: TranslationSessionModel): string {
  if (!model.indicatorOn) {
    return T.indicatorOff;
  }
  const reason = T.reasons[model.indicatorReason as keyof typeof T.reasons] ?? "capture";
  return T.indicatorOn(reason);
}
