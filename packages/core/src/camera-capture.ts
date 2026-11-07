/**
 * Direct capture with the glasses camera (checklist C01).
 *
 * A capture needs exact-true camera permission from the platform. While a capture runs, the recording
 * indicator is on for the whole capture. Only one capture runs at a time. The frame goes back to the
 * caller only: this controller keeps no copy. The camera driver is an injected adapter, so this module
 * does not claim physical glasses-camera operation.
 */

import type { CaptureIndicator } from "./capture-indicator.js";

/** Platform camera permission. Only an exact true result allows a capture. */
export type CapturePermissionPolicy = () => Promise<unknown>;

/** Platform camera driver. Resolves with one encoded frame, or rejects if capture fails. */
export interface CameraAdapter {
  capture(): Promise<Uint8Array>;
}

export interface CameraCaptureOptions {
  readonly adapter: CameraAdapter;
  readonly indicator: CaptureIndicator;
  readonly permission: CapturePermissionPolicy;
  /** Largest accepted frame in bytes. Integer from 1 to 16 MiB. */
  readonly maxFrameBytes: number;
}

export type CaptureResult =
  | { readonly status: "OK"; readonly frame: Uint8Array; readonly capturedAtMs: number }
  | {
      readonly status: "REFUSED";
      readonly reason:
        "NOT_PERMITTED" | "BUSY" | "BAD_INPUT" | "CAPTURE_FAILED" | "OVERSIZE" | "CANCELLED";
    };

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

export class CameraCapture {
  private readonly adapter: CameraAdapter;
  private readonly indicator: CaptureIndicator;
  private readonly permission: CapturePermissionPolicy;
  private readonly maxFrameBytes: number;
  private inProgress = false;
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
    this.permission = options.permission;
    this.maxFrameBytes = options.maxFrameBytes;
  }

  /** True while a capture is running. */
  get capturing(): boolean {
    return this.busy();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private busy(): boolean {
    return this.inProgress;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /**
   * Takes one photo. Refusals never call the adapter. The indicator is on from the moment the adapter
   * is called until it returns or fails, and is then turned off again.
   */
  async capturePhoto(atMs: number): Promise<CaptureResult> {
    if (!isValidTime(atMs)) return { status: "REFUSED", reason: "BAD_INPUT" };
    if (this.inProgress) return { status: "REFUSED", reason: "BUSY" };

    let allowed: unknown;
    try {
      allowed = await this.permission();
    } catch {
      allowed = false;
    }
    if (allowed !== true) return { status: "REFUSED", reason: "NOT_PERMITTED" };
    // Re-check after the await: another capture may have started while permission was being checked.
    if (this.busy()) return { status: "REFUSED", reason: "BUSY" };

    this.inProgress = true;
    this.cancelRequested = false;
    this.indicator.startSession("PHOTO_QUESTION");
    try {
      let frame: Uint8Array;
      try {
        frame = await this.adapter.capture();
      } catch {
        return { status: "REFUSED", reason: "CAPTURE_FAILED" };
      }
      if (this.cancelPending()) return { status: "REFUSED", reason: "CANCELLED" };
      if (!(frame instanceof Uint8Array) || frame.byteLength === 0) {
        return { status: "REFUSED", reason: "CAPTURE_FAILED" };
      }
      if (frame.byteLength > this.maxFrameBytes) return { status: "REFUSED", reason: "OVERSIZE" };
      return { status: "OK", frame, capturedAtMs: atMs };
    } finally {
      this.indicator.endSession("PHOTO_QUESTION");
      this.inProgress = false;
      this.cancelRequested = false;
    }
  }

  /**
   * Cancels the capture in progress, if any. The frame is discarded when it arrives, and the indicator
   * still follows the capture lifecycle.
   */
  cancel(): void {
    if (this.inProgress) this.cancelRequested = true;
  }
}
