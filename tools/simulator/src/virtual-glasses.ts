import { PROTOCOL_VERSION, ProtocolCodec, type EnvelopeMessage } from "@lensmate/protocol";
import {
  CaptureIndicator,
  IDLE_STATE,
  applyCutoff,
  captureSessionForEffect,
  onGesture,
  speechEnded,
  speechStarted,
  type EnvelopeHandler,
  type GlassesEffect,
  type GlassesLink,
  type GlassesState,
  type LinkStatus,
} from "@lensmate/core";

export const SIMULATED_MS_PER_CHARACTER = 60;
export const SIMULATED_STOP_DELAY_MS = 0;

export type SimulatorEvent =
  | { readonly kind: "BUTTON"; readonly action: string }
  | { readonly kind: "INDICATOR"; readonly on: boolean; readonly reason: string }
  | { readonly kind: "SPEECH_OUTPUT_SIMULATED"; readonly text: string; readonly durationMs: number }
  | { readonly kind: "SPEECH_STOPPED_SIMULATED"; readonly delayMs: number };

export type SimulatorEventHandler = (event: SimulatorEvent) => void;

const GESTURES: Readonly<
  Record<string, "SINGLE_TAP" | "DOUBLE_TAP" | "HOLD" | "RELEASE" | "PRESS">
> = {
  BUTTON_ACTION_SINGLE_TAP: "SINGLE_TAP",
  BUTTON_ACTION_DOUBLE_TAP: "DOUBLE_TAP",
  BUTTON_ACTION_HOLD: "HOLD",
  BUTTON_ACTION_RELEASE: "RELEASE",
  BUTTON_ACTION_PRESS: "PRESS",
};

/** Virtual glasses for deterministic development and software validation. */
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
  private lastButtonMs: number | undefined;

  constructor(
    private readonly codec: ProtocolCodec,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  get lastButtonAtMs(): number | undefined {
    return this.lastButtonMs;
  }
  get gestureEffects(): readonly GlassesEffect[] {
    return this.effects;
  }
  get spoken(): readonly string[] {
    return this.spokenLines;
  }
  get eventLog(): readonly SimulatorEvent[] {
    return this.events;
  }
  get isSpeaking(): boolean {
    return this.gestureState.speaking;
  }
  get status(): LinkStatus {
    return this.connection;
  }
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
    return () => this.handlers.delete(handler);
  }

  subscribeEvents(handler: SimulatorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  pressButton(action: string, pressMs = 0): void {
    this.requireConnected();
    this.lastButtonMs = this.clock();
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      button: { action, pressMs },
    });
    this.record({ kind: "BUTTON", action });
    const gesture = GESTURES[action];
    if (gesture === undefined) return;
    const transition = onGesture(this.gestureState, gesture);
    this.gestureState = transition.state;
    if (transition.effect === "STOP_SPEECH") {
      this.record({ kind: "SPEECH_STOPPED_SIMULATED", delayMs: SIMULATED_STOP_DELAY_MS });
    }
    this.applyEffect(transition.effect);
  }

  speak(line: string): void {
    this.requireConnected();
    if (this.gestureState.mode === "CUTOFF") return;
    this.spokenLines.push(line);
    this.gestureState = speechStarted(this.gestureState);
    this.record({
      kind: "SPEECH_OUTPUT_SIMULATED",
      text: line,
      durationMs: line.length * SIMULATED_MS_PER_CHARACTER,
    });
  }

  finishSpeech(): void {
    this.gestureState = speechEnded(this.gestureState);
  }

  cutOff(): void {
    this.gestureState = applyCutoff();
    this.indicator.endSession("PUSH_TO_TALK");
    this.indicator.endSession("PHOTO_QUESTION");
    this.emitIndicator();
  }

  private applyEffect(effect: GlassesEffect): void {
    if (effect === "NONE") return;
    this.effects.push(effect);
    if (effect === "START_PUSH_TO_TALK") {
      this.indicator.startSession("PUSH_TO_TALK");
      this.lastReason = "INDICATOR_REASON_PUSH_TO_TALK";
      this.emitIndicator();
    } else if (effect === "SEND_QUESTION" || effect === "CANCEL_QUESTION") {
      this.indicator.endSession("PUSH_TO_TALK");
      this.emitIndicator();
    } else if (captureSessionForEffect(effect) === "PHOTO_QUESTION") {
      this.indicator.startSession("PHOTO_QUESTION");
      this.lastReason = "INDICATOR_REASON_PHOTO_QUESTION";
      this.emitIndicator();
      this.indicator.endSession("PHOTO_QUESTION");
      this.emitIndicator();
    }
  }

  private handleFromApp(message: EnvelopeMessage): void {
    if (message.indicator !== undefined && message.indicator.on !== true) {
      if (!this.indicator.requestOff().ok) {
        this.emitAck(message.sequence, "ERROR_CODE_CAPTURE_ACTIVE");
      } else {
        this.emitIndicator();
      }
      return;
    }
    if (message.session !== undefined) this.emitAck(message.sequence, "ERROR_CODE_MALFORMED");
  }

  private emitIndicator(): void {
    const on = this.indicator.isOn;
    const reason = on ? this.lastReason : "INDICATOR_REASON_IDLE";
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      indicator: { on, reason },
    });
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
    for (const handler of this.handlers) handler(wire);
  }

  private record(event: SimulatorEvent): void {
    this.events.push(event);
    for (const handler of this.eventHandlers) handler(event);
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private requireConnected(): void {
    if (this.connection !== "connected") throw new Error("virtual glasses link is not connected");
  }
}
