/**
 * Live camera frame analysis (checklist C02).
 *
 * A frame leaves the device only after platform authorization returns exactly true. Every provider call
 * goes through the provider gateway, so cloud disclosure, spend limits and timeouts are enforced there.
 * A session samples frames by time, runs one analysis at a time, caps the number of analyses, and can be
 * cancelled. A result that arrives after cancellation is discarded. The session keeps no copy of a frame.
 * The provider and the authorization are injected, so no vendor or device is claimed.
 */

import type { GatewayErrorCode, ProviderGateway } from "./provider-gateway.js";

/** Platform check returning exactly true only when the check passes. */
export type FramePlatformCheck = () => Promise<unknown>;

export interface FrameProviderResult {
  readonly value: string;
  readonly costMinor: number;
}

/** One provider call for one frame. It must stop when the signal aborts. */
export type FrameProvider = (
  frame: Uint8Array,
  signal: AbortSignal,
) => Promise<FrameProviderResult>;

export interface FrameAnalysisOptions {
  readonly gateway: ProviderGateway;
  /** Feature name used for disclosure and spend accounting, for example "LIVE_FRAME_ANALYSIS". */
  readonly feature: string;
  /** Estimated cost of one analysis in minor units. Integer, zero or more. */
  readonly estimatedCostMinor: number;
  /** Authorization for sending a frame to the provider (exact true). */
  readonly authorize: FramePlatformCheck;
  readonly provider: FrameProvider;
  /** Largest accepted frame in bytes. Integer from 1 to 16 MiB. */
  readonly maxFrameBytes: number;
  /** Minimum time between accepted frames, in milliseconds. Integer, zero or more. */
  readonly minIntervalMs: number;
  /** Most analyses one session may run. Integer from 1 to 1000. */
  readonly maxAnalyses: number;
}

export type FrameAnalysisRefusal =
  | "BAD_INPUT"
  | "NOT_AUTHORIZED"
  | "OVERSIZE"
  | "BUSY"
  | "SAMPLED_OUT"
  | "LIMIT_REACHED"
  | "CANCELLED"
  | GatewayErrorCode;

export type FrameAnalysisResult =
  | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
  | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal };

const MAX_FRAME_LIMIT = 16 * 1024 * 1024;
const MAX_ANALYSES_LIMIT = 1000;

export class FrameAnalysisError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "FrameAnalysisError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/** Runs an authorization check. A throw or a non-true value counts as not authorized. */
async function authorized(check: FramePlatformCheck): Promise<boolean> {
  try {
    return (await check()) === true;
  } catch {
    return false;
  }
}

export class FrameAnalysisSession {
  private readonly options: FrameAnalysisOptions;
  private active = false;
  private cancelled = false;
  private analyses = 0;
  private lastAcceptedMs: number | null = null;
  private controller: AbortController | null = null;

  constructor(options: FrameAnalysisOptions) {
    if (!isNonNegativeInteger(options.estimatedCostMinor)) {
      throw new FrameAnalysisError(
        "INVALID_CONFIG",
        "estimatedCostMinor must be a non-negative integer",
      );
    }
    if (
      !Number.isInteger(options.maxFrameBytes) ||
      options.maxFrameBytes < 1 ||
      options.maxFrameBytes > MAX_FRAME_LIMIT
    ) {
      throw new FrameAnalysisError(
        "INVALID_CONFIG",
        "maxFrameBytes must be an integer 1 to 16 MiB",
      );
    }
    if (!isNonNegativeInteger(options.minIntervalMs)) {
      throw new FrameAnalysisError(
        "INVALID_CONFIG",
        "minIntervalMs must be a non-negative integer",
      );
    }
    if (
      !Number.isInteger(options.maxAnalyses) ||
      options.maxAnalyses < 1 ||
      options.maxAnalyses > MAX_ANALYSES_LIMIT
    ) {
      throw new FrameAnalysisError("INVALID_CONFIG", "maxAnalyses must be an integer 1 to 1000");
    }
    this.options = options;
  }

  /** True while an analysis is in flight. */
  get busy(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Analyses one frame. Refusals never reach the provider. The frame is passed to the provider call only
   * and is not stored by the session.
   */
  async analyze(frame: Uint8Array, atMs: number): Promise<FrameAnalysisResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isCancelled()) return { status: "REFUSED", reason: "CANCELLED" };
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };
    if (frame.byteLength > this.options.maxFrameBytes) {
      return { status: "REFUSED", reason: "OVERSIZE" };
    }
    if (this.analyses >= this.options.maxAnalyses) {
      return { status: "REFUSED", reason: "LIMIT_REACHED" };
    }
    if (this.lastAcceptedMs !== null && atMs - this.lastAcceptedMs < this.options.minIntervalMs) {
      return { status: "REFUSED", reason: "SAMPLED_OUT" };
    }

    this.active = true;
    const own = new AbortController();
    this.controller = own;
    try {
      if (!(await authorized(this.options.authorize))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      if (this.isCancelled()) return { status: "REFUSED", reason: "CANCELLED" };

      // Count the analysis and its sampling time before the provider call, so a failing provider still uses up the budget.
      this.analyses += 1;
      this.lastAcceptedMs = atMs;
      const result = await this.options.gateway.call(
        this.options.feature,
        this.options.estimatedCostMinor,
        (gatewaySignal) => {
          // The gateway's timeout and this session's cancel both stop the provider call.
          gatewaySignal.addEventListener("abort", () => {
            own.abort();
          });
          return this.options.provider(frame, own.signal);
        },
      );
      if (this.isCancelled()) return { status: "REFUSED", reason: "CANCELLED" };
      if (!result.ok) return { status: "REFUSED", reason: result.errorCode };
      return { status: "OK", value: result.value, analyzedAtMs: atMs };
    } finally {
      this.active = false;
      this.controller = null;
    }
  }

  /**
   * Cancels the session. Later requests are refused, the provider call in flight is aborted, and its
   * result is discarded when it settles.
   */
  cancel(): void {
    this.cancelled = true;
    this.controller?.abort();
  }
}
