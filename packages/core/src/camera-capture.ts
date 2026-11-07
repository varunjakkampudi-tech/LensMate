/**
 * Direct capture with the glasses camera (checklist C01).
 *
 * A capture needs three things, each confirmed by the platform with exactly true:
 *   1. verified wearer intent (a deliberate wearer command or physical control),
 *   2. camera permission,
 *   3. physical recording-indicator readiness, confirmed after the indicator session starts.
 * Missing, false, malformed or throwing answers fail closed, and the camera adapter is not called.
 * Cancellation applies from the moment a request starts, including while a check is pending. Only one
 * capture runs at a time. The frame goes back to the caller only: this controller keeps no copy.
 * Drivers are injected adapters, so this module does not claim physical glasses-camera operation.
 */

import type { CaptureIndicator } from "./capture-indicator.js";

/** Platform check returning exactly true only when the check passes. */
export type PlatformCheck = () => Promise<unknown>;

/** Platform camera driver. Resolves with one encoded frame, or rejects if capture fails. */
export interface CameraAdapter {
  capture(): Promise<Uint8Array>;
}

export interface CameraCaptureOptions {
  readonly adapter: CameraAdapter;
  readonly indicator: CaptureIndicator;
  /** Verified wearer intent for this capture (exact true). */
  readonly wearerIntent: PlatformCheck;
  /** Camera permission (exact true). */
  readonly permission: PlatformCheck;
  /** Physical recording-indicator readiness after the session starts (exact true). */
  readonly indicatorReady: PlatformCheck;
  /** Largest accepted frame in bytes. Integer from 1 to 16 MiB. */
  readonly maxFrameBytes: number;
}

export type CaptureRefusal =
  | "NO_WEARER_INTENT"
  | "NOT_PERMITTED"
  | "INDICATOR_UNCONFIRMED"
  | "BUSY"
  | "BAD_INPUT"
  | "CAPTURE_FAILED"
  | "OVERSIZE"
  | "CANCELLED";

export type CaptureResult =
  | { readonly status: "OK"; readonly frame: Uint8Array; readonly capturedAtMs: number }
  | { readonly status: "REFUSED"; readonly reason: CaptureRefusal };

const MAX_FRAME_LIMIT = 16 * 1024 * 1024;

export class CameraCaptureError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "CameraCaptureError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Runs a platform check. A throw or a non-true value counts as not confirmed. */
async function confirmed(check: PlatformCheck): Promise<boolean> {
  try {
    return (await check()) === true;
  } catch {
    return false;
  }
}

export class CameraCapture {
  private readonly adapter: CameraAdapter;
  private readonly indicator: CaptureIndicator;
  private readonly wearerIntent: PlatformCheck;
  private readonly permission: PlatformCheck;
  private readonly indicatorReady: PlatformCheck;
  private readonly maxFrameBytes: number;
  /** True from the start of a request until it settles, including while a platform check is pending. */
  private active = false;
  private cancelRequested = false;

  constructor(options: CameraCaptureOptions) {
    if (
      !Number.isInteger(options.maxFrameBytes) ||
      options.maxFrameBytes < 1 ||
      options.maxFrameBytes > MAX_FRAME_LIMIT
    ) {
      throw new CameraCaptureError(
        "INVALID_CONFIG",
        "maxFrameBytes must be an integer 1 to 16 MiB",
      );
    }
    this.adapter = options.adapter;
    this.indicator = options.indicator;
    this.wearerIntent = options.wearerIntent;
    this.permission = options.permission;
    this.indicatorReady = options.indicatorReady;
    this.maxFrameBytes = options.maxFrameBytes;
  }

  /** True while a request is in progress. */
  get capturing(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /**
   * Takes one photo. Refusals never call the camera adapter. The recording indicator session is open
   * from after the platform checks until the capture settles, and is then closed.
   */
  async capturePhoto(atMs: number): Promise<CaptureResult> {
    if (!isValidTime(atMs)) return { status: "REFUSED", reason: "BAD_INPUT" };
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    // Mark the request active before the first await, so cancel() can reach it from this point on.
    this.active = true;
    this.cancelRequested = false;
    let sessionOpen = false;
    try {
      if (!(await confirmed(this.wearerIntent))) {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "NO_WEARER_INTENT");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");

      if (!(await confirmed(this.permission))) {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "NOT_PERMITTED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");

      this.indicator.startSession("PHOTO_QUESTION");
      sessionOpen = true;
      if (!(await confirmed(this.indicatorReady))) {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "INDICATOR_UNCONFIRMED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");

      let frame: Uint8Array;
      try {
        frame = await this.adapter.capture();
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "CAPTURE_FAILED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");
      if (!(frame instanceof Uint8Array) || frame.byteLength === 0) {
        return this.refuse("CAPTURE_FAILED");
      }
      if (frame.byteLength > this.maxFrameBytes) return this.refuse("OVERSIZE");
      return { status: "OK", frame, capturedAtMs: atMs };
    } finally {
      if (sessionOpen) this.indicator.endSession("PHOTO_QUESTION");
      this.active = false;
      this.cancelRequested = false;
    }
  }

  private refuse(reason: CaptureRefusal): CaptureResult {
    return { status: "REFUSED", reason };
  }

  /**
   * Cancels the request in progress, if any, from the moment it starts. The camera adapter is not
   * called once cancellation is seen, and a frame that arrives after cancellation is discarded.
   */
  cancel(): void {
    if (this.isActive()) this.cancelRequested = true;
  }
}
