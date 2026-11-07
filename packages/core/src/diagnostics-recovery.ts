/**
 * Diagnostics and crash recovery (checklist B23).
 *
 * Crashes are classified and counted. Several crashes inside a window put the device into SAFE_MODE,
 * which survives restart and is left only by explicit confirmation. Diagnostic entries are kept in a
 * bounded log, passed through the existing log allowlist and redaction, and never stored raw.
 * Saved state that cannot be read fails closed into SAFE_MODE.
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
  readonly log: readonly LogEntry[];
}

export interface DiagnosticsOptions {
  /** Crashes inside `crashWindowMs` that trigger safe mode. */
  readonly crashThreshold?: number;
  readonly crashWindowMs?: number;
  /** Most recent log entries kept. */
  readonly maxLogEntries?: number;
}

export type ExitResult =
  | { readonly status: "EXITED" }
  | { readonly status: "REFUSED"; readonly reason: "NOT_CONFIRMED" | "NOT_IN_SAFE_MODE" };

export type CrashResult = {
  readonly category: CrashCategory;
  readonly mode: Mode;
};

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_LOG = 200;
const MAX_CRASH_HISTORY = 64;

const CATEGORY_BY_KIND: Readonly<Record<CrashKind, CrashCategory>> = {
  JS_EXCEPTION: "SOFTWARE",
  NATIVE: "NATIVE",
  OUT_OF_MEMORY: "RESOURCE",
  WATCHDOG: "HANG",
};

const MODES: readonly Mode[] = ["NORMAL", "SAFE_MODE"];
const REASONS: readonly SafeModeReason[] = ["CRASH_LOOP", "STATE_UNREADABLE"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

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
    (s["crashTimesMs"] as unknown[]).every(isFiniteNumber) &&
    Array.isArray(s["log"]) &&
    (s["log"] as unknown[]).every((e) => typeof e === "object" && e !== null)
  );
}

function copy(state: DiagnosticsState): DiagnosticsState {
  return {
    mode: state.mode,
    safeModeReason: state.safeModeReason,
    crashTimesMs: [...state.crashTimesMs],
    log: state.log.map((entry) => ({ ...entry })),
  };
}

export class DiagnosticsRecovery {
  private state: DiagnosticsState;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly maxLog: number;

  private constructor(state: DiagnosticsState, options: DiagnosticsOptions) {
    this.state = copy(state);
    this.threshold = options.crashThreshold ?? DEFAULT_THRESHOLD;
    this.windowMs = options.crashWindowMs ?? DEFAULT_WINDOW_MS;
    this.maxLog = options.maxLogEntries ?? DEFAULT_MAX_LOG;
  }

  static fresh(options: DiagnosticsOptions = {}): DiagnosticsRecovery {
    return new DiagnosticsRecovery(
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: [], log: [] },
      options,
    );
  }

  /**
   * Restores saved state. Unreadable state does not become NORMAL: it enters SAFE_MODE with reason
   * STATE_UNREADABLE and an empty log, until an explicit exit.
   */
  static restore(saved: unknown, options: DiagnosticsOptions = {}): DiagnosticsRecovery {
    if (!validState(saved)) {
      return new DiagnosticsRecovery(
        { mode: "SAFE_MODE", safeModeReason: "STATE_UNREADABLE", crashTimesMs: [], log: [] },
        options,
      );
    }
    return new DiagnosticsRecovery(saved, options);
  }

  get mode(): Mode {
    return this.state.mode;
  }

  /** A deep copy. Changing it does not change the controller. */
  snapshot(): DiagnosticsState {
    return copy(this.state);
  }

  /** Records a crash: classifies it, counts it in the window, and enters safe mode on a loop. */
  recordCrash(kind: string, atMs: number): CrashResult {
    const known = Object.prototype.hasOwnProperty.call(CATEGORY_BY_KIND, kind);
    const category: CrashCategory = known ? CATEGORY_BY_KIND[kind as CrashKind] : "UNKNOWN";
    const recentFloor = atMs - this.windowMs;
    const crashTimes = [...this.state.crashTimesMs, atMs]
      .filter((t) => t >= recentFloor)
      .slice(-MAX_CRASH_HISTORY);
    const loop = crashTimes.length >= this.threshold;
    const mode: Mode = this.state.mode === "SAFE_MODE" || loop ? "SAFE_MODE" : "NORMAL";
    const reason: SafeModeReason | null =
      this.state.mode === "SAFE_MODE" ? this.state.safeModeReason : loop ? "CRASH_LOOP" : null;
    this.state = {
      mode,
      safeModeReason: reason,
      crashTimesMs: crashTimes,
      log: this.appendLog({ event: "crash", level: "error", errorCode: category, timestamp: atMs }),
    };
    return { category, mode };
  }

  /** Records an ordinary diagnostic event. Fields outside the allowlist are dropped. */
  recordEvent(event: string, atMs: number, fields: Readonly<Record<string, unknown>> = {}): void {
    this.state = {
      ...this.state,
      log: this.appendLog({ ...fields, event, timestamp: atMs }),
    };
  }

  /** Leaves safe mode. Refused unless confirmed is exactly true and the device is in safe mode. */
  exitSafeMode(confirmed: unknown, atMs: number): ExitResult {
    if (confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
    if (this.state.mode !== "SAFE_MODE") return { status: "REFUSED", reason: "NOT_IN_SAFE_MODE" };
    this.state = {
      mode: "NORMAL",
      safeModeReason: null,
      crashTimesMs: [],
      log: this.appendLog({ event: "safe_mode_exited", level: "info", timestamp: atMs }),
    };
    return { status: "EXITED" };
  }

  private appendLog(entry: Readonly<Record<string, unknown>>): LogEntry[] {
    const safe = toSafeLogEntry(entry);
    return [...this.state.log, safe].slice(-this.maxLog);
  }
}
