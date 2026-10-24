import { PROTOCOL_VERSION, ProtocolCodec, type EnvelopeMessage } from "@lensmate/protocol";
import {
  CaptureIndicator,
  IDLE_STATE,
  applyCutoff,
  captureSessionForEffect,
  checkSilenceTimer,
  listeningSessionOf,
  onGesture,
  onVoiceCommand,
  recordSpeech,
  speechEnded,
  speechStarted,
  startListeningSession,
  startSilenceTimer,
  stopListeningSession,
  type CaptureSessionType,
  type EnvelopeHandler,
  type Gesture,
  type GlassesEffect,
  type GlassesLink,
  type GlassesState,
  type LinkStatus,
  type ListeningSessionType,
  type SilenceTimer,
  type VoiceCommand,
} from "@lensmate/core";

/** SIMULATED: speech output lasts the text length times this many milliseconds. Nothing is measured. */
export const SIMULATED_MS_PER_CHARACTER = 60;

/** SIMULATED: the virtual glasses stop speech at once on a press. Nothing is measured (v9 G19). */
export const SIMULATED_STOP_DELAY_MS = 0;

export type SessionSource = "APP" | "VOICE";
export type SessionEndCause = "APP" | "VOICE" | "SILENCE" | "CUTOFF";

/**
 * One entry in the simulator's event log, or one item fed to a subscriber. The log is the full record the
 * tests check. Speech output entries are SIMULATED: the glasses are virtual, so their timing is a model.
 */
export type SimulatorEvent =
  | { readonly kind: "BUTTON"; readonly action: string }
  | {
      readonly kind: "SESSION_STARTED";
      readonly session: ListeningSessionType;
      readonly source: SessionSource;
      readonly atMs: number;
    }
  | {
      readonly kind: "SESSION_ENDED";
      readonly session: ListeningSessionType;
      readonly cause: SessionEndCause;
      readonly atMs: number;
    }
  | { readonly kind: "ANNOUNCEMENT"; readonly text: string }
  | { readonly kind: "INDICATOR"; readonly on: boolean; readonly reason: string }
  | { readonly kind: "SPEECH_ACTIVITY"; readonly atMs: number }
  | {
      readonly kind: "VOICE_COMMAND";
      readonly phrase: string;
      readonly command: VoiceCommand | null;
      readonly accepted: boolean;
    }
  | { readonly kind: "CAPTION_TEXT"; readonly text: string }
  | { readonly kind: "SPEECH_OUTPUT_SIMULATED"; readonly text: string; readonly durationMs: number }
  | { readonly kind: "SPEECH_STOPPED_SIMULATED"; readonly delayMs: number };

export type SimulatorEventHandler = (event: SimulatorEvent) => void;

const GESTURE_BY_ACTION: Readonly<Record<string, Gesture>> = {
  BUTTON_ACTION_SINGLE_TAP: "SINGLE_TAP",
  BUTTON_ACTION_DOUBLE_TAP: "DOUBLE_TAP",
  BUTTON_ACTION_HOLD: "HOLD",
  BUTTON_ACTION_RELEASE: "RELEASE",
  BUTTON_ACTION_PRESS: "PRESS",
};

const SESSION_TYPES: Readonly<Record<string, CaptureSessionType>> = {
  SESSION_TYPE_PUSH_TO_TALK: "PUSH_TO_TALK",
  SESSION_TYPE_PHOTO_QUESTION: "PHOTO_QUESTION",
  SESSION_TYPE_TRANSLATION: "TRANSLATION",
  SESSION_TYPE_CAPTION: "CAPTION",
};

const CAPTURE_SESSION_TYPES: readonly CaptureSessionType[] = [
  "PUSH_TO_TALK",
  "PHOTO_QUESTION",
  "TRANSLATION",
  "CAPTION",
];

/** The phrases the scripted glasses recognise. Anything else is logged and ignored. */
const VOICE_PHRASES: ReadonlyMap<string, VoiceCommand> = new Map([
  ["start translation", "START_TRANSLATION"],
  ["stop translation", "STOP_TRANSLATION"],
  ["start captions", "START_CAPTIONS"],
  ["stop captions", "STOP_CAPTIONS"],
]);

const SESSION_OF_COMMAND: Readonly<Record<VoiceCommand, ListeningSessionType>> = {
  START_TRANSLATION: "TRANSLATION",
  STOP_TRANSLATION: "TRANSLATION",
  START_CAPTIONS: "CAPTION",
  STOP_CAPTIONS: "CAPTION",
};

const SESSION_START_PHASES = new Set(["SESSION_PHASE_STARTING", "SESSION_PHASE_ACTIVE"]);
const SESSION_END_PHASES = new Set(["SESSION_PHASE_ENDING", "SESSION_PHASE_ENDED"]);

const INDICATOR_REASONS: Readonly<Record<CaptureSessionType, string>> = {
  PUSH_TO_TALK: "INDICATOR_REASON_PUSH_TO_TALK",
  PHOTO_QUESTION: "INDICATOR_REASON_PHOTO_QUESTION",
  TRANSLATION: "INDICATOR_REASON_TRANSLATION",
  CAPTION: "INDICATOR_REASON_CAPTION",
};

function isListeningType(type: CaptureSessionType): type is ListeningSessionType {
  return type === "TRANSLATION" || type === "CAPTION";
}

/**
 * Virtual glasses: a GlassesLink that behaves like the glasses for the app (v9 section 13, Goal 7).
 * Every envelope passes through the protocol codec in both directions, so schema violations fail here
 * the same way they would on the real link. The indicator rule (G6), the gesture precedence (v9 5.0),
 * the voice rules (C02) and the silence limit (v9 5.3) are enforced here as on hardware.
 *
 * Scripted input that has no wire message yet (speech activity, voice commands, caption text, speech
 * output) goes through the event log and `subscribeEvents`. The protocol package is not changed for it.
 */
export class VirtualGlasses implements GlassesLink {
  private connection: LinkStatus = "disconnected";
  private readonly handlers = new Set<EnvelopeHandler>();
  private readonly eventHandlers = new Set<SimulatorEventHandler>();
  private readonly events: SimulatorEvent[] = [];
  private readonly indicator = new CaptureIndicator();
  private readonly appMessages: EnvelopeMessage[] = [];
  private readonly spokenLines: string[] = [];
  private lastReason = "INDICATOR_REASON_IDLE";
  private lastIndicatorKey: string | null = null;
  private sequence = 0;
  private gestureState: GlassesState = IDLE_STATE;
  private readonly effects: GlassesEffect[] = [];
  /** The silence timer for the running listening session. Speech resets it (v9 5.3). */
  private silence: SilenceTimer = { lastSpeechMs: 0 };

  /** Time of the most recent button event, on `clock`, in milliseconds. Used by the phone-side measurement. */
  private lastButtonMs: number | undefined;

  constructor(
    private readonly codec: ProtocolCodec,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** When the glasses emitted the latest button event, on the same clock the phone reads. */
  get lastButtonAtMs(): number | undefined {
    return this.lastButtonMs;
  }

  /** Effects the gesture state machine produced, in order (for example photo captures). */
  get gestureEffects(): readonly GlassesEffect[] {
    return this.effects;
  }

  /** Lines the glasses spoke, in order: session announcements and speech. */
  get spoken(): readonly string[] {
    return this.spokenLines;
  }

  /** Every simulator event so far, in order. Tests check whole sequences against this. */
  get eventLog(): readonly SimulatorEvent[] {
    return this.events;
  }

  get isSpeaking(): boolean {
    return this.gestureState.speaking;
  }

  get status(): LinkStatus {
    return this.connection;
  }

  /** Envelopes the app has sent, after the codec round trip. Used by tests and the measurement harness. */
  get receivedFromApp(): readonly EnvelopeMessage[] {
    return this.appMessages;
  }

  get indicatorOn(): boolean {
    return this.indicator.isOn;
  }

  connect(): Promise<void> {
    this.connection = "connected";
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connection = "disconnected";
    return Promise.resolve();
  }

  send(message: EnvelopeMessage): Promise<void> {
    try {
      this.requireConnected();
      const wire = this.codec.decode(this.codec.encode(message));
      this.appMessages.push(wire);
      this.handleFromApp(wire);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  subscribe(handler: EnvelopeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Receives every simulator event as it happens, in the same order as the log. Returns the unsubscribe. */
  subscribeEvents(handler: SimulatorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /** Simulates a button event from the glasses. */
  pressButton(action: string, pressMs = 0): void {
    this.requireConnected();
    this.lastButtonMs = this.clock();
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      button: { action, pressMs },
    });
    this.record({ kind: "BUTTON", action });
    const gesture = GESTURE_BY_ACTION[action];
    if (gesture === undefined) {
      return;
    }
    const transition = onGesture(this.gestureState, gesture);
    this.gestureState = transition.state;
    if (transition.effect === "STOP_SPEECH") {
      this.record({ kind: "SPEECH_STOPPED_SIMULATED", delayMs: SIMULATED_STOP_DELAY_MS });
    }
    this.applyEffect(transition.effect);
  }

  /** The glasses start speaking a line. A press during speech stops it (G19). Duration is SIMULATED. */
  speak(line: string): void {
    this.requireConnected();
    if (this.gestureState.mode === "CUTOFF") {
      return;
    }
    this.spokenLines.push(line);
    this.gestureState = speechStarted(this.gestureState);
    this.record({
      kind: "SPEECH_OUTPUT_SIMULATED",
      text: line,
      durationMs: line.length * SIMULATED_MS_PER_CHARACTER,
    });
  }

  /** Speech finished on its own. */
  finishSpeech(): void {
    this.gestureState = speechEnded(this.gestureState);
  }

  /** Speech heard on the listening session, from either speaker. Resets the silence timer (v9 5.3). */
  heardSpeech(): void {
    const atMs = this.clock();
    this.silence = recordSpeech(atMs);
    this.record({ kind: "SPEECH_ACTIVITY", atMs });
  }

  /**
   * A scripted voice phrase. Accepted only inside a listening session the user started (C02). Anything
   * else is logged as not accepted and changes nothing.
   */
  voiceCommand(phrase: string): void {
    this.requireConnected();
    const command = VOICE_PHRASES.get(phrase.trim().toLowerCase());
    if (command === undefined) {
      this.record({ kind: "VOICE_COMMAND", phrase, command: null, accepted: false });
      return;
    }
    const result = onVoiceCommand(this.gestureState, command);
    this.record({ kind: "VOICE_COMMAND", phrase, command, accepted: result.accepted });
    if (!result.accepted) {
      return;
    }
    const session = SESSION_OF_COMMAND[command];
    if (command.startsWith("START_")) {
      this.switchTo(result.state, session, "VOICE", result.announcement);
    } else {
      this.endListening(session, "VOICE", result.state);
    }
  }

  /**
   * A scripted caption line from the speaker. Shown only while a translation or caption session runs.
   * Returns false, and records nothing, when no listening session is running.
   */
  deliverCaption(text: string): boolean {
    this.requireConnected();
    if (listeningSessionOf(this.gestureState) === null) {
      return false;
    }
    this.record({ kind: "CAPTION_TEXT", text });
    return true;
  }

  /** Ends a translation or caption session after two minutes without speech (v9 5.3, section 21). */
  checkSilence(): void {
    const check = checkSilenceTimer(this.gestureState, this.silence, this.clock());
    if (check.endedSession === null) {
      return;
    }
    this.endListening(check.endedSession, "SILENCE", check.state);
  }

  /** Thermal, battery or privacy cutoff (v9 5.0 precedence item 1): camera and radio off. */
  cutOff(): void {
    const ended = listeningSessionOf(this.gestureState);
    this.gestureState = applyCutoff();
    for (const type of CAPTURE_SESSION_TYPES) {
      this.indicator.endSession(type);
    }
    if (ended !== null) {
      this.record({ kind: "SESSION_ENDED", session: ended, cause: "CUTOFF", atMs: this.clock() });
    }
    this.emitIndicator();
  }

  /** Effects that change what the glasses show or record. */
  private applyEffect(effect: GlassesEffect): void {
    if (effect === "NONE") {
      return;
    }
    this.effects.push(effect);
    if (effect === "START_PUSH_TO_TALK") {
      this.indicator.startSession("PUSH_TO_TALK");
      this.lastReason = INDICATOR_REASONS.PUSH_TO_TALK;
      this.emitIndicator();
    } else if (effect === "SEND_QUESTION" || effect === "CANCEL_QUESTION") {
      this.indicator.endSession("PUSH_TO_TALK");
      this.emitIndicator();
    } else if (captureSessionForEffect(effect) === "PHOTO_QUESTION") {
      this.runPhotoCapture();
    }
  }

  /** A single or double tap captures one frame. The indicator is on for the capture (G6, section 21). */
  private runPhotoCapture(): void {
    this.indicator.startSession("PHOTO_QUESTION");
    this.lastReason = INDICATOR_REASONS.PHOTO_QUESTION;
    this.emitIndicator();
    this.indicator.endSession("PHOTO_QUESTION");
    this.emitIndicator();
  }

  private handleFromApp(message: EnvelopeMessage): void {
    if (message.indicator !== undefined && message.indicator.on !== true) {
      // Proto3 omits false, so a missing `on` means off. Software may not turn the indicator off in capture.
      const result = this.indicator.requestOff();
      if (!result.ok) {
        this.emitAck(message.sequence, "ERROR_CODE_CAPTURE_ACTIVE");
        return;
      }
      this.emitIndicator();
      return;
    }
    if (message.session !== undefined) {
      this.handleSession(message);
    }
  }

  private handleSession(message: EnvelopeMessage): void {
    const session = message.session;
    const type = session?.type === undefined ? undefined : SESSION_TYPES[session.type];
    // Push-to-talk and photo start only by gesture (v9 section 21), so the app cannot open them.
    if (session === undefined || type === undefined || !isListeningType(type)) {
      this.emitAck(message.sequence, "ERROR_CODE_MALFORMED");
      return;
    }
    const phase = session.phase ?? "";
    if (SESSION_START_PHASES.has(phase)) {
      const started = startListeningSession(this.gestureState, type);
      if (!started.accepted) {
        this.emitAck(message.sequence, "ERROR_CODE_CAPTURE_ACTIVE");
        return;
      }
      this.switchTo(started.state, type, "APP", started.announcement);
      return;
    }
    if (SESSION_END_PHASES.has(phase)) {
      this.stopFromApp(type);
      return;
    }
    this.emitAck(message.sequence, "ERROR_CODE_MALFORMED");
  }

  /**
   * Starts a listening session from idle (app) or from a hold or another session (voice). The new session
   * starts before the old one ends, so the indicator stays on through a switch. The announcement is
   * recorded before the indicator turns on (G15).
   */
  private switchTo(
    next: GlassesState,
    type: ListeningSessionType,
    source: SessionSource,
    announcement: string | null,
  ): void {
    const previous = listeningSessionOf(this.gestureState);
    this.gestureState = next;
    this.indicator.startSession(type);
    const atMs = this.clock();
    if (previous !== null) {
      this.indicator.endSession(previous);
      this.record({ kind: "SESSION_ENDED", session: previous, cause: source, atMs });
    }
    this.indicator.endSession("PUSH_TO_TALK");
    this.silence = startSilenceTimer(atMs);
    this.lastReason = INDICATOR_REASONS[type];
    this.record({ kind: "SESSION_STARTED", session: type, source, atMs });
    if (announcement !== null) {
      this.spokenLines.push(announcement);
      this.record({ kind: "ANNOUNCEMENT", text: announcement });
    }
    this.emitIndicator();
  }

  /** Ends a listening session and turns the indicator off unless something else is capturing. */
  private endListening(
    type: ListeningSessionType,
    cause: SessionEndCause,
    next: GlassesState,
  ): void {
    this.gestureState = next;
    this.indicator.endSession(type);
    this.record({ kind: "SESSION_ENDED", session: type, cause, atMs: this.clock() });
    this.emitIndicator();
  }

  /** An app request to end a session. Only the session that is running ends; the rest is ignored. */
  private stopFromApp(type: ListeningSessionType): void {
    if (this.gestureState.mode === type) {
      this.endListening(type, "APP", stopListeningSession(this.gestureState));
      return;
    }
    this.indicator.endSession(type);
    this.emitIndicator();
  }

  private emitIndicator(): void {
    const on = this.indicator.isOn;
    const reason = on ? this.lastReason : "INDICATOR_REASON_IDLE";
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      indicator: { on, reason },
    });
    // The event log records a change only, so a repeated state is not logged twice.
    const key = on ? reason : "OFF";
    if (key !== this.lastIndicatorKey) {
      this.lastIndicatorKey = key;
      this.record({ kind: "INDICATOR", on, reason });
    }
  }

  private emitAck(ackedSequence: number, error: string): void {
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      ack: { ackedSequence, error },
    });
  }

  private emit(message: EnvelopeMessage): void {
    const wire = this.codec.decode(this.codec.encode(message));
    for (const handler of this.handlers) {
      handler(wire);
    }
  }

  private record(event: SimulatorEvent): void {
    this.events.push(event);
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private requireConnected(): void {
    if (this.connection !== "connected") {
      throw new Error("virtual glasses link is not connected");
    }
  }
}
