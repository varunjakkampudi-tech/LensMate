import { PROTOCOL_VERSION, ProtocolCodec, type EnvelopeMessage } from "@smartglass/protocol";
import {
  CaptureIndicator,
  type CaptureSessionType,
  type EnvelopeHandler,
  type GlassesLink,
  type LinkStatus,
} from "@smartglass/core";

const SESSION_TYPES: Readonly<Record<string, CaptureSessionType>> = {
  SESSION_TYPE_PUSH_TO_TALK: "PUSH_TO_TALK",
  SESSION_TYPE_PHOTO_QUESTION: "PHOTO_QUESTION",
  SESSION_TYPE_TRANSLATION: "TRANSLATION",
  SESSION_TYPE_CAPTION: "CAPTION",
};

const SESSION_START_PHASES = new Set(["SESSION_PHASE_STARTING", "SESSION_PHASE_ACTIVE"]);
const SESSION_END_PHASES = new Set(["SESSION_PHASE_ENDING", "SESSION_PHASE_ENDED"]);

const INDICATOR_REASONS: Readonly<Record<CaptureSessionType, string>> = {
  PUSH_TO_TALK: "INDICATOR_REASON_PUSH_TO_TALK",
  PHOTO_QUESTION: "INDICATOR_REASON_PHOTO_QUESTION",
  TRANSLATION: "INDICATOR_REASON_TRANSLATION",
  CAPTION: "INDICATOR_REASON_CAPTION",
};

/**
 * Virtual glasses: a GlassesLink that behaves like the glasses for the app (v9 section 13, Goal 7).
 * Every envelope passes through the protocol codec in both directions, so schema violations fail here
 * the same way they would on the real link. The indicator rule (G6) is enforced here as on hardware.
 */
export class VirtualGlasses implements GlassesLink {
  private connection: LinkStatus = "disconnected";
  private readonly handlers = new Set<EnvelopeHandler>();
  private readonly indicator = new CaptureIndicator();
  private readonly appMessages: EnvelopeMessage[] = [];
  private lastReason = "INDICATOR_REASON_IDLE";
  private sequence = 0;

  constructor(private readonly codec: ProtocolCodec) {}

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
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      button: { action, pressMs },
    });
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
    if (session === undefined || type === undefined) {
      this.emitAck(message.sequence, "ERROR_CODE_MALFORMED");
      return;
    }
    const phase = session.phase ?? "";
    if (SESSION_START_PHASES.has(phase)) {
      this.indicator.startSession(type);
      this.lastReason = INDICATOR_REASONS[type];
      this.emitIndicator();
      return;
    }
    if (SESSION_END_PHASES.has(phase)) {
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
