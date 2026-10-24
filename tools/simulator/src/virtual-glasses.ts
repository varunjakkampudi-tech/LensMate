import { PROTOCOL_VERSION, ProtocolCodec, type EnvelopeMessage } from "@lensmate/protocol";
import {
  CaptureIndicator,
  IDLE_STATE,
  applyCutoff,
  applySilenceTimeout,
  captureSessionForEffect,
  onGesture,
  speechEnded,
  speechStarted,
  startListeningSession,
  stopListeningSession,
  type CaptureSessionType,
  type EnvelopeHandler,
  type Gesture,
  type GlassesEffect,
  type GlassesLink,
  type GlassesState,
  type LinkStatus,
  type ListeningSessionType,
} from "@lensmate/core";

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
 * the same way they would on the real link. The indicator rule (G6) and the gesture precedence (v9 5.0)
 * are enforced here as on hardware.
 */
export class VirtualGlasses implements GlassesLink {
  private connection: LinkStatus = "disconnected";
  private readonly handlers = new Set<EnvelopeHandler>();
  private readonly indicator = new CaptureIndicator();
  private readonly appMessages: EnvelopeMessage[] = [];
  private readonly spokenLines: string[] = [];
  private lastReason = "INDICATOR_REASON_IDLE";
  private sequence = 0;
  private gestureState: GlassesState = IDLE_STATE;
  private readonly effects: GlassesEffect[] = [];
  /** Time of the most recent speech on the listening session, on `clock`. Drives the silence timeout. */
  private lastSpeechMs = 0;

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

  /** Simulates a button event from the glasses. */
  pressButton(action: string, pressMs = 0): void {
    this.requireConnected();
    this.lastButtonMs = this.clock();
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      button: { action, pressMs },
    });
    const gesture = GESTURE_BY_ACTION[action];
    if (gesture === undefined) {
      return;
    }
    const transition = onGesture(this.gestureState, gesture);
    this.gestureState = transition.state;
    this.applyEffect(transition.effect);
  }

  /** The glasses start speaking a line. A press during speech stops it (G19). */
  speak(line: string): void {
    this.requireConnected();
    if (this.gestureState.mode === "CUTOFF") {
      return;
    }
    this.spokenLines.push(line);
    this.gestureState = speechStarted(this.gestureState);
  }

  /** Speech finished on its own. */
  finishSpeech(): void {
    this.gestureState = speechEnded(this.gestureState);
  }

  /** Speech heard on a listening session, from either speaker. Resets the silence timer. */
  heardSpeech(): void {
    this.lastSpeechMs = this.clock();
  }

  /** Ends a translation or caption session after two minutes without speech (v9 5.3, section 21). */
  checkSilence(): void {
    const before = this.gestureState;
    const after = applySilenceTimeout(before, this.clock() - this.lastSpeechMs);
    if (after.mode === before.mode) {
      return;
    }
    this.gestureState = after;
    const ended: ListeningSessionType = before.mode === "CAPTION" ? "CAPTION" : "TRANSLATION";
    this.indicator.endSession(ended);
    this.emitIndicator();
  }

  /** Thermal, battery or privacy cutoff (v9 5.0 precedence item 1): camera and radio off. */
  cutOff(): void {
    this.gestureState = applyCutoff();
    for (const type of CAPTURE_SESSION_TYPES) {
      this.indicator.endSession(type);
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
      this.gestureState = started.state;
      if (started.announcement !== null) {
        this.spokenLines.push(started.announcement);
      }
      this.lastSpeechMs = this.clock();
      this.indicator.startSession(type);
      this.lastReason = INDICATOR_REASONS[type];
      this.emitIndicator();
      return;
    }
    if (SESSION_END_PHASES.has(phase)) {
      if (this.gestureState.mode === type) {
        this.gestureState = stopListeningSession(this.gestureState);
      }
      this.indicator.endSession(type);
      this.emitIndicator();
      return;
    }
    this.emitAck(message.sequence, "ERROR_CODE_MALFORMED");
  }

  private emitIndicator(): void {
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      indicator: {
        on: this.indicator.isOn,
        reason: this.indicator.isOn ? this.lastReason : "INDICATOR_REASON_IDLE",
      },
    });
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
