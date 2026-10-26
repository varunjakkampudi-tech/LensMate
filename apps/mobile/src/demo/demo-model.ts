import {
  IDLE_STATE,
  ProviderGateway,
  SpendCap,
  checkSilenceTimer,
  isCapturing,
  onGesture,
  recordSpeech,
  silenceRemainingMs,
  speechEnded,
  speechStarted,
  startListeningSession,
  startSilenceTimer,
  stopListeningSession,
  type Gesture,
  type GatewayErrorCode,
  type GlassesState,
  type ProviderRun,
  type SilenceTimer,
} from "@lensmate/core";
import {
  defaultQuestionOf,
  questionById,
  type PhraseId,
  type QuestionId,
  type SceneId,
} from "./demo-catalogue";
import { formatCountdown, translateTranscript, type TranslationResult } from "./demo-translation";
import { DEMO } from "./demo-strings";

/**
 * Pure state logic for the SEE-HEAR-TALK demo. No React and no network. Glasses gestures and speech use the
 * same rules as core (glasses-state), the spend cap and the gateway are core's, and the only answer source is
 * a mock ProviderRun with canned text. Nothing here is real AI output.
 */

/** The demo conditions the user can choose. Each one is driven by the mock, never by a real service. */
export type DemoScenario =
  "NORMAL" | "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "SPEND_CAP" | "OFFLINE";

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  "NORMAL",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "SPEND_CAP",
  "OFFLINE",
];

export type DemoErrorCode = "TIMEOUT" | "UNAVAILABLE" | "CAP_REACHED" | "OFFLINE";

export type DemoPhase =
  "IDLE" | "PROCESSING" | "STREAMING" | "PLAYING" | "STOPPED" | "DONE" | "ERROR";

export type DemoLogKind =
  | "SCENE"
  | "SCENARIO"
  | "PHOTO"
  | "HOLD"
  | "RELEASE"
  | "QUESTION"
  | "ANSWER"
  | "STOP"
  | "DONE"
  | "ERROR"
  | "OCR"
  | "TRANSLATION_START"
  | "TRANSLATION_STOP";

/** SIMULATED timing. The pace is fixed by the demo, not measured on the device. */
export const DEMO_TIMING = {
  /** How long the photo indicator stays on for the simulated capture. */
  photoCaptureMs: 500,
  /** Mock provider latency before the canned answer arrives. */
  processingMs: 400,
  /** One word appears, and one simulated tick passes, every this many milliseconds. */
  wordMs: 120,
  /** Simulated playback after the last word, in ticks. */
  playbackTicks: 8,
  /** The gateway's per-attempt timeout. */
  timeoutMs: 1500,
  /** How often the translation countdown advances, in real milliseconds. */
  translationTickMs: 250,
  /** How much simulated time each translation tick adds. The countdown is SIMULATED, not real time. */
  translationStepMs: 10_000,
} as const;

/** The result of "Read the text" for one scene. The fixture text is shown as MOCK OCR output, never as a reading. */
export type OcrOutcome =
  { readonly kind: "TEXT"; readonly lines: readonly string[] } | { readonly kind: "NO_TEXT" };

/** The synthetic translation session. Its timer runs on simulated time; the glasses state holds the mode. */
interface TranslationState {
  /** The spoken-announcement text, recorded when the session starts. Null when no session runs. */
  readonly announcement: string | null;
  /** Core's silence timer for the running session, or null. */
  readonly timer: SilenceTimer | null;
  /** Simulated milliseconds since the session started. */
  readonly simMs: number;
  readonly result: TranslationResult | null;
  /** Why the most recent session ended, or null if none has ended yet. */
  readonly endedBy: "STOP" | "SILENCE" | null;
}

const INITIAL_TRANSLATION: TranslationState = {
  announcement: null,
  timer: null,
  simMs: 0,
  result: null,
  endedBy: null,
};

/** MOCK budget figures, in minor units, as the spend cap uses them. The cost is an assumed mock value. */
export const ANSWER_COST_MINOR = 10;
export const DEMO_CAP_MINOR = 1000;

const DEMO_FEATURE = "demo-mock-answer";

export interface CannedAnswer {
  readonly label: string;
  readonly text: string;
}

export interface Budget {
  readonly capMinor: number;
  readonly spentMinor: number;
}

export interface DemoRequest {
  readonly requestId: number;
  readonly sceneId: SceneId;
  readonly questionId: QuestionId;
  readonly scenario: DemoScenario;
  readonly budget: Budget;
}

export interface DemoState {
  readonly scenario: DemoScenario;
  readonly sceneId: SceneId | null;
  /** Glasses state from core. Push-to-talk, speech and idle are all read from it. */
  readonly glasses: GlassesState;
  /** True while a simulated photo capture is running. */
  readonly photoCapture: boolean;
  readonly photos: number;
  readonly questionId: QuestionId | null;
  readonly phase: DemoPhase;
  readonly answer: CannedAnswer | null;
  /** Simulated ticks since the answer started. Words shown and the playback position both follow it. */
  readonly ticks: number;
  readonly error: DemoErrorCode | null;
  /** Where the user stopped speech, on the simulated timeline. Never a wall-clock measurement. */
  readonly stopSimulatedMs: number | null;
  readonly budget: Budget;
  readonly requestId: number;
  /** The request the effect must run. Set when a question is accepted, cleared on reset. */
  readonly pending: DemoRequest | null;
  /** The MOCK text reading of the chosen scene, or null before "Read the text" is pressed. */
  readonly ocr: OcrOutcome | null;
  readonly translation: TranslationState;
  readonly log: readonly DemoLogKind[];
}

export type DemoAction =
  | { readonly type: "SCENARIO"; readonly scenario: DemoScenario }
  | { readonly type: "SCENE"; readonly sceneId: SceneId }
  | { readonly type: "GESTURE"; readonly gesture: Gesture }
  | { readonly type: "PHOTO_DONE" }
  | { readonly type: "ASK"; readonly questionId: QuestionId }
  | { readonly type: "RETRY" }
  | { readonly type: "BACK" }
  | { readonly type: "TICK" }
  | { readonly type: "ANSWER"; readonly requestId: number; readonly outcome: AnswerOutcome }
  | { readonly type: "READ_TEXT" }
  | { readonly type: "TRANSLATION_START" }
  | { readonly type: "TRANSLATION_PHRASE"; readonly phraseId: PhraseId }
  | { readonly type: "TRANSLATION_TICK" }
  | { readonly type: "TRANSLATION_STOP" };

export type AnswerOutcome =
  | { readonly ok: true; readonly answer: CannedAnswer; readonly costMinor: number }
  | { readonly ok: false; readonly error: DemoErrorCode };

export function budgetFor(scenario: DemoScenario): Budget {
  return {
    capMinor: DEMO_CAP_MINOR,
    spentMinor: scenario === "SPEND_CAP" ? DEMO_CAP_MINOR : 0,
  };
}

export function initialDemoState(scenario: DemoScenario = "NORMAL"): DemoState {
  return {
    scenario,
    sceneId: null,
    glasses: IDLE_STATE,
    photoCapture: false,
    photos: 0,
    questionId: null,
    phase: "IDLE",
    answer: null,
    ticks: 0,
    error: null,
    stopSimulatedMs: null,
    budget: budgetFor(scenario),
    requestId: 0,
    pending: null,
    ocr: null,
    translation: INITIAL_TRANSLATION,
    log: [],
  };
}

/** The canned answer for one scene and one of its questions. Keyed by both, so a mismatch is an error. */
export function cannedAnswer(sceneId: SceneId, questionId: QuestionId): CannedAnswer {
  if (questionById(questionId).sceneId !== sceneId) {
    throw new RangeError(`question ${questionId} does not belong to scene ${sceneId}`);
  }
  return { label: DEMO.mockLabel, text: DEMO.answers[questionId] };
}

/**
 * The mock provider, as a ProviderRun from core. It returns the canned answer after a fixed delay, or
 * stalls until the gateway aborts it (timeout), or fails (unavailable). It never calls a network.
 */
export function mockAnswerRun(
  answer: CannedAnswer,
  scenario: DemoScenario,
): ProviderRun<CannedAnswer> {
  return (signal) =>
    new Promise<{ value: CannedAnswer; costMinor: number }>((resolve, reject) => {
      if (scenario === "PROVIDER_TIMEOUT") {
        signal.addEventListener("abort", () => {
          reject(new Error("mock provider stalled and was aborted"));
        });
        return;
      }
      const timer = setTimeout(() => {
        if (scenario === "PROVIDER_UNAVAILABLE") {
          reject(new Error("mock provider unavailable"));
          return;
        }
        resolve({ value: answer, costMinor: ANSWER_COST_MINOR });
      }, DEMO_TIMING.processingMs);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("mock provider aborted"));
      });
    });
}

/** Maps a gateway error to the demo's error codes. Every gateway failure lands on a message the user sees. */
export function toDemoError(code: GatewayErrorCode): DemoErrorCode {
  if (code === "TIMEOUT") {
    return "TIMEOUT";
  }
  if (code === "CAP_REACHED") {
    return "CAP_REACHED";
  }
  return "UNAVAILABLE";
}

/**
 * Sends one request through core's ProviderGateway: spend cap, circuit, one attempt with a timeout. A cap
 * refusal returns CAP_REACHED without the run being called. This function never rejects.
 */
export async function answerThroughGateway(
  request: DemoRequest,
  run: ProviderRun<CannedAnswer>,
): Promise<AnswerOutcome> {
  const gateway = new ProviderGateway(
    new SpendCap(request.budget.capMinor, request.budget.spentMinor),
    {
      timeoutMs: DEMO_TIMING.timeoutMs,
      maxAttempts: 1,
      circuitFailureThreshold: 3,
      circuitCooldownMs: 30_000,
      now: () => Date.now(),
    },
  );
  // The demo sends nothing off the device, so the disclosure gate is accepted for this demo feature only.
  gateway.acceptDisclosure(DEMO_FEATURE);
  try {
    const result = await gateway.call(DEMO_FEATURE, ANSWER_COST_MINOR, run);
    if (result.ok) {
      return { ok: true, answer: result.value, costMinor: result.costMinor };
    }
    return { ok: false, error: toDemoError(result.errorCode) };
  } catch {
    return { ok: false, error: "UNAVAILABLE" };
  }
}

const BUSY_PHASES: ReadonlySet<DemoPhase> = new Set<DemoPhase>([
  "PROCESSING",
  "STREAMING",
  "PLAYING",
]);

export function isBusy(state: DemoState): boolean {
  return BUSY_PHASES.has(state.phase);
}

/** A question can start only when no answer runs, no push-to-talk is held, and no photo is being taken. */
function canStartQuestion(state: DemoState): boolean {
  return !isBusy(state) && !isCapturing(state.glasses) && !state.photoCapture;
}

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "SCENARIO":
      return isBusy(state)
        ? state
        : {
            ...resetAnswer(state),
            scenario: action.scenario,
            budget: budgetFor(action.scenario),
            log: [...state.log, "SCENARIO"],
          };
    case "SCENE":
      return isBusy(state)
        ? state
        : { ...resetAnswer(state), sceneId: action.sceneId, log: [...state.log, "SCENE"] };
    case "GESTURE":
      return applyGesture(state, action.gesture);
    case "PHOTO_DONE":
      return state.photoCapture ? { ...state, photoCapture: false } : state;
    case "ASK":
      return askQuestion(state, action.questionId);
    case "RETRY":
      return state.phase === "ERROR" && state.questionId !== null && state.error !== "CAP_REACHED"
        ? askQuestion(state, state.questionId)
        : state;
    case "BACK":
      return state.phase === "ERROR" ? resetAnswer(state) : state;
    case "TICK":
      return tick(state);
    case "ANSWER":
      return applyAnswer(state, action);
    case "READ_TEXT":
      return readText(state);
    case "TRANSLATION_START":
      return startTranslation(state);
    case "TRANSLATION_PHRASE":
      return speakPhrase(state, action.phraseId);
    case "TRANSLATION_TICK":
      return tickTranslation(state);
    case "TRANSLATION_STOP":
      return stopTranslation(state);
  }
}

/** Reads the text of the chosen scene from its fixture. No capture, no camera, no network. */
export function readSceneText(sceneId: SceneId): OcrOutcome {
  const lines = DEMO.ocr.fixtureLines[sceneId];
  return lines.length === 0 ? { kind: "NO_TEXT" } : { kind: "TEXT", lines: [...lines] };
}

function readText(state: DemoState): DemoState {
  if (state.sceneId === null || isBusy(state) || isCapturing(state.glasses) || state.photoCapture) {
    return state;
  }
  return { ...state, ocr: readSceneText(state.sceneId), log: [...state.log, "OCR"] };
}

/**
 * Starts a translation session through core's rule. The announcement is recorded in the same step that turns
 * the indicator on, so the indicator never shows a session that has not been announced.
 */
function startTranslation(state: DemoState): DemoState {
  if (isBusy(state) || state.photoCapture) {
    return state;
  }
  const start = startListeningSession(state.glasses, "TRANSLATION");
  if (!start.accepted || start.announcement === null) {
    return state;
  }
  return {
    ...state,
    glasses: start.state,
    translation: {
      announcement: start.announcement,
      timer: startSilenceTimer(0),
      simMs: 0,
      result: null,
      endedBy: null,
    },
    log: [...state.log, "TRANSLATION_START"],
  };
}

/** A synthetic phrase is taken: the translation is looked up, and the silence timer restarts from it. */
function speakPhrase(state: DemoState, phraseId: PhraseId): DemoState {
  const { translation } = state;
  if (state.glasses.mode !== "TRANSLATION" || translation.timer === null) {
    return state;
  }
  return {
    ...state,
    translation: {
      ...translation,
      timer: recordSpeech(translation.simMs),
      result: translateTranscript(DEMO.translation.phrases[phraseId]),
    },
  };
}

/** Advances the simulated clock and applies core's silence limit. The session ends when the limit is reached. */
function tickTranslation(state: DemoState): DemoState {
  const { translation } = state;
  if (state.glasses.mode !== "TRANSLATION" || translation.timer === null) {
    return state;
  }
  const simMs = translation.simMs + DEMO_TIMING.translationStepMs;
  const check = checkSilenceTimer(state.glasses, translation.timer, simMs);
  if (check.endedSession === null) {
    return { ...state, translation: { ...translation, simMs } };
  }
  return {
    ...state,
    glasses: check.state,
    translation: { ...INITIAL_TRANSLATION, simMs, endedBy: "SILENCE" },
    log: [...state.log, "TRANSLATION_STOP"],
  };
}

/** The user ends the session. Core's stop rule ends it, and the phrase and its translation are cleared. */
function stopTranslation(state: DemoState): DemoState {
  if (state.glasses.mode !== "TRANSLATION") {
    return state;
  }
  return {
    ...state,
    glasses: stopListeningSession(state.glasses),
    translation: { ...INITIAL_TRANSLATION, simMs: state.translation.simMs, endedBy: "STOP" },
    log: [...state.log, "TRANSLATION_STOP"],
  };
}

/** The countdown text for the running session (SIMULATED), or null when none runs. */
export function translationCountdown(state: DemoState): string | null {
  const { timer, simMs } = state.translation;
  if (state.glasses.mode !== "TRANSLATION" || timer === null) {
    return null;
  }
  return formatCountdown(silenceRemainingMs(timer, simMs));
}

function applyGesture(state: DemoState, gesture: Gesture): DemoState {
  // While the answer is being prepared, only a press has any effect (it stops speech, and none is playing yet).
  if (state.phase === "PROCESSING" && gesture !== "PRESS") {
    return state;
  }
  const transition = onGesture(state.glasses, gesture);
  switch (transition.effect) {
    case "CAPTURE_PHOTO":
      if (state.sceneId === null || state.photoCapture || isCapturing(state.glasses)) {
        return state;
      }
      return {
        ...state,
        photoCapture: true,
        photos: state.photos + 1,
        log: [...state.log, "PHOTO"],
      };
    case "START_PUSH_TO_TALK":
      if (state.sceneId === null || state.photoCapture) {
        return state;
      }
      return { ...state, glasses: transition.state, log: [...state.log, "HOLD"] };
    case "SEND_QUESTION": {
      if (state.sceneId === null) {
        return { ...state, glasses: transition.state };
      }
      const released: DemoState = {
        ...state,
        glasses: transition.state,
        log: [...state.log, "RELEASE"],
      };
      return askQuestion(released, defaultQuestionOf(state.sceneId));
    }
    case "CANCEL_QUESTION":
      return { ...state, glasses: transition.state };
    case "STOP_SPEECH":
      return {
        ...state,
        glasses: transition.state,
        phase: "STOPPED",
        stopSimulatedMs: state.ticks * DEMO_TIMING.wordMs,
        log: [...state.log, "STOP"],
      };
    default:
      return state;
  }
}

function askQuestion(state: DemoState, questionId: QuestionId): DemoState {
  if (state.sceneId === null || !canStartQuestion(state)) {
    return state;
  }
  if (questionById(questionId).sceneId !== state.sceneId) {
    return state;
  }
  const requestId = state.requestId + 1;
  const started: DemoState = {
    ...state,
    questionId,
    answer: null,
    error: null,
    stopSimulatedMs: null,
    ticks: 0,
    requestId,
    log: [...state.log, "QUESTION"],
  };
  if (state.scenario === "OFFLINE") {
    // Offline: nothing leaves the phone. The gateway is not called.
    return {
      ...started,
      phase: "ERROR",
      error: "OFFLINE",
      pending: null,
      log: [...started.log, "ERROR"],
    };
  }
  return {
    ...started,
    phase: "PROCESSING",
    pending: {
      requestId,
      sceneId: state.sceneId,
      questionId,
      scenario: state.scenario,
      budget: state.budget,
    },
  };
}

function applyAnswer(state: DemoState, action: Extract<DemoAction, { type: "ANSWER" }>): DemoState {
  // A late answer for a request that was reset or replaced is ignored.
  if (state.phase !== "PROCESSING" || action.requestId !== state.requestId) {
    return state;
  }
  if (!action.outcome.ok) {
    return { ...state, phase: "ERROR", error: action.outcome.error, log: [...state.log, "ERROR"] };
  }
  return {
    ...state,
    phase: "STREAMING",
    answer: action.outcome.answer,
    ticks: 0,
    glasses: speechStarted(state.glasses),
    budget: { ...state.budget, spentMinor: state.budget.spentMinor + action.outcome.costMinor },
    log: [...state.log, "ANSWER"],
  };
}

function tick(state: DemoState): DemoState {
  if (state.answer === null) {
    return state;
  }
  const words = wordCount(state.answer);
  if (state.phase === "STREAMING") {
    const ticks = state.ticks + 1;
    return ticks >= words ? { ...state, ticks, phase: "PLAYING" } : { ...state, ticks };
  }
  if (state.phase === "PLAYING") {
    const ticks = state.ticks + 1;
    if (ticks >= words + DEMO_TIMING.playbackTicks) {
      return {
        ...state,
        ticks,
        phase: "DONE",
        glasses: speechEnded(state.glasses),
        log: [...state.log, "DONE"],
      };
    }
    return { ...state, ticks };
  }
  return state;
}

function resetAnswer(state: DemoState): DemoState {
  return {
    ...state,
    phase: "IDLE",
    questionId: null,
    answer: null,
    ticks: 0,
    error: null,
    stopSimulatedMs: null,
    pending: null,
    ocr: null,
  };
}

export function wordCount(answer: CannedAnswer): number {
  return answer.text.split(" ").length;
}

/** The words shown so far. Words appear at the fixed simulated pace. */
export function visibleAnswer(state: DemoState): string {
  if (state.answer === null) {
    return "";
  }
  return state.answer.text.split(" ").slice(0, state.ticks).join(" ");
}

export interface IndicatorState {
  readonly camera: boolean;
  readonly microphone: boolean;
}

/** Camera and microphone use in the demo, from the same rules as core: a photo, or a held push-to-talk. */
export function indicatorState(state: DemoState): IndicatorState {
  return { camera: state.photoCapture, microphone: isCapturing(state.glasses) };
}

export function indicatorText(state: DemoState): string {
  if (state.photoCapture) {
    return DEMO.indicatorPhoto;
  }
  if (state.glasses.mode === "TRANSLATION") {
    return DEMO.indicatorTranslation;
  }
  if (isCapturing(state.glasses)) {
    return DEMO.indicatorHold;
  }
  return DEMO.indicatorOff;
}

export interface LogSummary {
  readonly photos: number;
  readonly questions: number;
  readonly answers: number;
  readonly stops: number;
  readonly errors: number;
  readonly ocr: number;
  readonly translationStarts: number;
  readonly translationStops: number;
}

export function summarizeLog(log: readonly DemoLogKind[]): LogSummary {
  const count = (kind: DemoLogKind): number => log.filter((entry) => entry === kind).length;
  return {
    photos: count("PHOTO"),
    questions: count("QUESTION"),
    answers: count("ANSWER"),
    stops: count("STOP"),
    errors: count("ERROR"),
    ocr: count("OCR"),
    translationStarts: count("TRANSLATION_START"),
    translationStops: count("TRANSLATION_STOP"),
  };
}

/** The share of the MOCK budget used, from 0 to 1. */
export function budgetFraction(budget: Budget): number {
  if (budget.capMinor === 0) {
    return 1;
  }
  return Math.min(1, budget.spentMinor / budget.capMinor);
}
