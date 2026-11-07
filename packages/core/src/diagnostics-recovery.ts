/**
 * Diagnostics and crash recovery (checklist B23).
 *
 * Crashes are classified and counted. Several crashes inside a window put the device into SAFE_MODE,
 * which survives restart. Leaving safe mode needs explicit confirmation and a successful recovery
 * verification from a trusted policy supplied by the platform. Diagnostic entries are kept in a
 * bounded log and always pass through the existing log allowlist and redaction, including entries
 * restored from saved state. Invalid timestamps and configuration are handled deterministically,
 * and saved state that cannot be read fails closed into SAFE_MODE.
 *
 * Pure logic: time is injected and state is a value the platform saves. No native crash handler,
 * network upload, or device code is imported here.
 */

import { toSafeLogEntry } from "./log-redaction.js";
import type { LogEntry } from "./log-redaction.js";

export type CrashKind = "JS_EXCEPTION" | "NATIVE" | "OUT_OF_MEMORY" | "WATCHDOG";
export type CrashCategory = "SOFTWARE" | "NATIVE" | "RESOURCE" | "HANG" | "UNKNOWN";
export type Mode = "NORMAL" | "SAFE_MODE";
export type SafeModeReason = "CRASH_LOOP" | "STATE_UNREADABLE";

export interface DiagnosticsState {
  readonly mode: Mode;
  readonly safeModeReason: SafeModeReason | null;
  /** Crash times inside the window, oldest first. */
  readonly crashTimesMs: readonly number[];
  /** Latest valid time seen. Invalid event times fall back to it. */
  readonly latestMs: number;
  readonly log: readonly LogEntry[];
}

export interface DiagnosticsOptions {
  /** Crashes inside `crashWindowMs` that trigger safe mode. Integer 1 to 100. */
  readonly crashThreshold?: number;
  /** Length of the crash window in milliseconds. Positive, at most 30 days. */
  readonly crashWindowMs?: number;
  /** Most recent log entries kept. Integer 1 to 10000. */
  readonly maxLogEntries?: number;
}

/** Recovery verification supplied by the platform. Must resolve true only when recovery succeeded. */
export type RecoveryVerifier = () => Promise<unknown>;

export type ExitResult =
  | { readonly status: "EXITED" }
  | {
      readonly status: "REFUSED";
      readonly reason: "NOT_CONFIRMED" | "NOT_IN_SAFE_MODE" | "NOT_VERIFIED" | "STALE_VERIFICATION";
    };

export type CrashResult = {
  readonly category: CrashCategory;
  readonly mode: Mode;
};

export type DiagnosticsErrorCode = "INVALID_CONFIG";

export class DiagnosticsError extends Error {
  constructor(
    readonly code: DiagnosticsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DiagnosticsError";
  }
}

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_LOG = 200;
const MAX_CRASH_HISTORY = 64;
// A threshold above the retained history could never be reached, so the two limits are the same.
const MAX_THRESHOLD = MAX_CRASH_HISTORY;
const MAX_LOG_LIMIT = 10_000;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const CATEGORY_BY_KIND: Readonly<Record<CrashKind, CrashCategory>> = {
  JS_EXCEPTION: "SOFTWARE",
  NATIVE: "NATIVE",
  OUT_OF_MEMORY: "RESOURCE",
  WATCHDOG: "HANG",
};

const MODES: readonly Mode[] = ["NORMAL", "SAFE_MODE"];
const REASONS: readonly SafeModeReason[] = ["CRASH_LOOP", "STATE_UNREADABLE"];

interface Limits {
  readonly threshold: number;
  readonly windowMs: number;
  readonly maxLog: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function resolveLimits(options: DiagnosticsOptions): Limits {
  const threshold = options.crashThreshold ?? DEFAULT_THRESHOLD;
  const windowMs = options.crashWindowMs ?? DEFAULT_WINDOW_MS;
  const maxLog = options.maxLogEntries ?? DEFAULT_MAX_LOG;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > MAX_THRESHOLD) {
    throw new DiagnosticsError("INVALID_CONFIG", "crashThreshold must be an integer from 1 to 100");
  }
  if (!isFiniteNumber(windowMs) || windowMs <= 0 || windowMs > MAX_WINDOW_MS) {
    throw new DiagnosticsError(
      "INVALID_CONFIG",
      "crashWindowMs must be positive and at most 30 days",
    );
  }
  if (!Number.isInteger(maxLog) || maxLog < 1 || maxLog > MAX_LOG_LIMIT) {
    throw new DiagnosticsError(
      "INVALID_CONFIG",
      "maxLogEntries must be an integer from 1 to 10000",
    );
  }
  return { threshold, windowMs, maxLog };
}

/**
 * Checks saved state. Log entries are not trusted: each one must be an object, and is later
 * sanitized through the allowlist and redaction, so raw saved text never reaches the state.
 */
function validState(value: unknown): value is DiagnosticsState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s["mode"] === "string" &&
    (MODES as readonly string[]).includes(s["mode"]) &&
    (s["safeModeReason"] === null ||
      (typeof s["safeModeReason"] === "string" &&
        (REASONS as readonly string[]).includes(s["safeModeReason"]))) &&
    (s["mode"] === "SAFE_MODE") === (s["safeModeReason"] !== null) &&
    Array.isArray(s["crashTimesMs"]) &&
    (s["crashTimesMs"] as unknown[]).every(isValidTime) &&
    isValidTime(s["latestMs"]) &&
    Array.isArray(s["log"]) &&
    (s["log"] as unknown[]).every((e) => typeof e === "object" && e !== null && !Array.isArray(e))
  );
}

function copy(state: DiagnosticsState): DiagnosticsState {
  return {
    mode: state.mode,
    safeModeReason: state.safeModeReason,
    crashTimesMs: [...state.crashTimesMs],
    latestMs: state.latestMs,
    log: state.log.map((entry) => ({ ...entry })),
  };
}

export class DiagnosticsRecovery {
  private state: DiagnosticsState;
  private readonly limits: Limits;
  /** Bumped on every crash, so a verification that started earlier cannot apply to newer failures. */
  private generation = 0;

  private constructor(state: DiagnosticsState, limits: Limits) {
    this.state = copy(state);
    this.limits = limits;
  }

  static fresh(options: DiagnosticsOptions = {}): DiagnosticsRecovery {
    const limits = resolveLimits(options);
    return new DiagnosticsRecovery(
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: [], latestMs: 0, log: [] },
      limits,
    );
  }

  /**
   * Restores saved state. Unreadable state does not become NORMAL: it enters SAFE_MODE with reason
   * STATE_UNREADABLE and an empty log, until verified exit. Restored log entries are sanitized
   * again, and an oversized log keeps only its newest entries.
   */
  static restore(saved: unknown, options: DiagnosticsOptions = {}): DiagnosticsRecovery {
    const limits = resolveLimits(options);
    if (!validState(saved)) {
      return new DiagnosticsRecovery(
        {
          mode: "SAFE_MODE",
          safeModeReason: "STATE_UNREADABLE",
          crashTimesMs: [],
          latestMs: 0,
          log: [],
        },
        limits,
      );
    }
    const log = saved.log
      .map((entry) => toSafeLogEntry(entry as Readonly<Record<string, unknown>>))
      .slice(-limits.maxLog);
    const crashTimesMs = saved.crashTimesMs.slice(-MAX_CRASH_HISTORY);
    return new DiagnosticsRecovery(
      {
        mode: saved.mode,
        safeModeReason: saved.safeModeReason,
        crashTimesMs,
        latestMs: saved.latestMs,
        log,
      },
      limits,
    );
  }

  get mode(): Mode {
    return this.state.mode;
  }

  /** A deep copy. Changing it does not change the controller. */
  snapshot(): DiagnosticsState {
    return copy(this.state);
  }

  /**
   * Records a crash. The crash always counts toward the current window, even if its timestamp is
   * invalid (the latest valid time is used) or earlier than the latest time seen, so out-of-order
   * timestamps cannot hide a crash loop.
   */
  recordCrash(kind: string, atMs: number): CrashResult {
    this.generation += 1;
    const known = Object.prototype.hasOwnProperty.call(CATEGORY_BY_KIND, kind);
    const category: CrashCategory = known ? CATEGORY_BY_KIND[kind as CrashKind] : "UNKNOWN";
    const time = this.effectiveTime(atMs);
    const latestMs = Math.max(this.state.latestMs, time);
    const floor = latestMs - this.limits.windowMs;
    const history = this.state.crashTimesMs.filter((t) => t >= floor);
    // An out-of-order crash is counted as current: it is stored at the latest time seen, so it
    // cannot fall outside the window it belongs to.
    const windowTime = Math.max(time, this.state.latestMs);
    const crashTimes = [...history, windowTime].slice(-MAX_CRASH_HISTORY);
    const inWindow = history.length + 1;
    const loop = inWindow >= this.limits.threshold;
    const mode: Mode = this.state.mode === "SAFE_MODE" || loop ? "SAFE_MODE" : "NORMAL";
    const reason: SafeModeReason | null =
      this.state.mode === "SAFE_MODE" ? this.state.safeModeReason : loop ? "CRASH_LOOP" : null;
    this.state = {
      mode,
      safeModeReason: reason,
      crashTimesMs: crashTimes,
      latestMs,
      log: this.appendLog({ event: "crash", level: "error", errorCode: category, timestamp: time }),
    };
    return { category, mode };
  }

  /** Records an ordinary diagnostic event. Fields outside the allowlist are dropped. */
  recordEvent(event: string, atMs: number, fields: Readonly<Record<string, unknown>> = {}): void {
    const time = this.effectiveTime(atMs);
    this.state = {
      ...this.state,
      latestMs: Math.max(this.state.latestMs, time),
      log: this.appendLog({ ...fields, event, timestamp: time }),
    };
  }

  /**
   * Leaves safe mode. Requires confirmed exactly true, and a recovery verifier that resolves true.
   * A missing, failed, malformed or throwing verifier keeps SAFE_MODE in place.
   */
  async exitSafeMode(
    confirmed: unknown,
    atMs: number,
    verify: RecoveryVerifier,
  ): Promise<ExitResult> {
    if (confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
    if (this.state.mode !== "SAFE_MODE") return { status: "REFUSED", reason: "NOT_IN_SAFE_MODE" };
    const startedAt = this.generation;
    let verified: unknown;
    try {
      verified = await verify();
    } catch {
      verified = false;
    }
    if (verified !== true) return { status: "REFUSED", reason: "NOT_VERIFIED" };
    // A crash while verification was pending means the verification no longer describes the device.
    if (this.generation !== startedAt) {
      return { status: "REFUSED", reason: "STALE_VERIFICATION" };
    }
    const time = this.effectiveTime(atMs);
    this.state = {
      mode: "NORMAL",
      safeModeReason: null,
      crashTimesMs: [],
      latestMs: Math.max(this.state.latestMs, time),
      log: this.appendLog({ event: "safe_mode_exited", level: "info", timestamp: time }),
    };
    return { status: "EXITED" };
  }

  /** A valid timestamp is used as given; an invalid one falls back to the latest valid time. */
  private effectiveTime(atMs: number): number {
    return isValidTime(atMs) ? atMs : this.state.latestMs;
  }

  private appendLog(entry: Readonly<Record<string, unknown>>): LogEntry[] {
    const safe = toSafeLogEntry(entry);
    return [...this.state.log, safe].slice(-this.limits.maxLog);
  }
}
