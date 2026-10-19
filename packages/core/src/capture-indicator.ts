/**
 * Session types that use the camera or microphone in the P-1 scope (v9 section 21).
 * Companion, walk, sound alert and helper call are not part of P-1 and have no code path.
 */
export type CaptureSessionType = "PUSH_TO_TALK" | "PHOTO_QUESTION" | "TRANSLATION" | "CAPTION";

export type IndicatorOffResult = { ok: true } | { ok: false; reason: "CAPTURE_ACTIVE" };

/**
 * The recording indicator rule (v9 G6, Standards section 3): the indicator is on while any
 * capture session is active, and software can never turn it off during capture.
 */
export class CaptureIndicator {
  private readonly activeSessions = new Set<CaptureSessionType>();

  startSession(type: CaptureSessionType): void {
    this.activeSessions.add(type);
  }

  endSession(type: CaptureSessionType): void {
    this.activeSessions.delete(type);
  }

  get isOn(): boolean {
    return this.activeSessions.size > 0;
  }

  /** Software may turn the indicator off only when no capture session is active. */
  requestOff(): IndicatorOffResult {
    if (this.activeSessions.size > 0) {
      return { ok: false, reason: "CAPTURE_ACTIVE" };
    }
    return { ok: true };
  }
}
