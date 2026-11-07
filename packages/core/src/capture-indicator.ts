/**
 * Session types that use the camera or microphone.
 */
export type CaptureSessionType = "PUSH_TO_TALK" | "PHOTO_QUESTION";

export type IndicatorOffResult = { ok: true } | { ok: false; reason: "CAPTURE_ACTIVE" };

/**
 * The recording indicator rule: the indicator is on while any capture session is active, and software
 * can never turn it off during capture. Sessions are counted per type, so two owners of the same type
 * cannot switch the indicator off while the other is still capturing.
 */
export class CaptureIndicator {
  private readonly activeSessions = new Map<CaptureSessionType, number>();

  startSession(type: CaptureSessionType): void {
    this.activeSessions.set(type, (this.activeSessions.get(type) ?? 0) + 1);
  }

  /** Ends one session of this type. Ending a session that never started changes nothing. */
  endSession(type: CaptureSessionType): void {
    const count = this.activeSessions.get(type) ?? 0;
    if (count <= 1) {
      this.activeSessions.delete(type);
    } else {
      this.activeSessions.set(type, count - 1);
    }
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
