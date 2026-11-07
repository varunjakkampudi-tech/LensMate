/**
 * Local clock and timestamp continuity (checklist B20).
 *
 * Wall-clock UTC can jump (user change, time sync, rollback). Monotonic time only moves forward
 * within one boot. This module uses both: it stamps events with a wall-clock reading, a monotonic
 * reading, a boot id and a strictly increasing sequence number. It flags readings whose wall clock
 * disagrees with monotonic elapsed time, and it marks a reading UNCERTAIN until a trusted sync
 * clears it. The sequence number keeps event order across restarts.
 *
 * Pure logic. The platform supplies the clock readings, so tests use injected clocks. No phone,
 * cloud, or native code is imported. Authenticating a time source is the caller's job: `applySync`
 * accepts only samples the caller has marked `authenticated: true`.
 */

export interface ClockSource {
  /** UTC epoch milliseconds from the device wall clock. */
  wallMs(): number;
  /** Milliseconds from an arbitrary origin. Never decreases within one boot. */
  monotonicMs(): number;
  /** Identifies the current boot. Changes on reboot. */
  bootId(): string;
}

export type Provenance = "SYNCED" | "DEVICE_UNSYNCED" | "STALE" | "UNCERTAIN";

export interface ClockReading {
  readonly utcMs: number;
  readonly monotonicMs: number;
  readonly bootId: string;
  readonly seq: number;
  readonly provenance: Provenance;
}

/** Persisted clock state. Save it with each batch of events; restore it on start. */
export interface ClockState {
  readonly bootId: string;
  readonly lastMonotonicMs: number;
  readonly lastWallMs: number;
  readonly seq: number;
  readonly syncBootId: string | null;
  readonly syncMonotonicMs: number | null;
  readonly syncOffsetMs: number;
  readonly uncertain: boolean;
  readonly jumps: number;
}

export interface TrustedSync {
  readonly utcMs: number;
  readonly monotonicMs: number;
  readonly bootId: string;
  /** Must be true. The caller has verified the sample's origin and integrity. */
  readonly authenticated: true;
}

export type SyncResult =
  | { readonly status: "APPLIED" }
  | {
      readonly status: "REJECTED";
      readonly reason:
        "NOT_AUTHENTICATED" | "BAD_VALUE" | "OTHER_BOOT" | "FUTURE_SAMPLE" | "OLDER_THAN_LAST_SYNC";
    };

export type ClockErrorCode = "CLOCK_CORRUPT" | "INVALID_READING";

export class ClockError extends Error {
  constructor(
    readonly code: ClockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClockError";
  }
}

export interface LocalClockOptions {
  /** How far wall time may differ from monotonic elapsed time before it counts as a jump. */
  readonly jumpToleranceMs?: number;
  /** A sync older than this (on monotonic time) makes the clock STALE. */
  readonly maxSyncAgeMs?: number;
}

const DEFAULT_TOLERANCE_MS = 1_000;
const DEFAULT_MAX_SYNC_AGE_MS = 24 * 60 * 60 * 1000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Live platform readings must be finite and well-formed. Invalid readings fail closed. */
function checkReading(wallMs: unknown, monotonicMs: unknown, bootId: unknown): void {
  if (
    !isFiniteNumber(wallMs) ||
    !isFiniteNumber(monotonicMs) ||
    monotonicMs < 0 ||
    typeof bootId !== "string" ||
    bootId === ""
  ) {
    throw new ClockError("INVALID_READING", "clock reading from the platform is invalid");
  }
}

function validState(value: unknown): value is ClockState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s["bootId"] === "string" &&
    s["bootId"] !== "" &&
    isFiniteNumber(s["lastMonotonicMs"]) &&
    s["lastMonotonicMs"] >= 0 &&
    isFiniteNumber(s["lastWallMs"]) &&
    Number.isInteger(s["seq"]) &&
    (s["seq"] as number) >= 0 &&
    (s["syncBootId"] === null || typeof s["syncBootId"] === "string") &&
    (s["syncMonotonicMs"] === null ||
      (isFiniteNumber(s["syncMonotonicMs"]) && s["syncMonotonicMs"] >= 0)) &&
    (s["syncBootId"] === null) === (s["syncMonotonicMs"] === null) &&
    isFiniteNumber(s["syncOffsetMs"]) &&
    typeof s["uncertain"] === "boolean" &&
    Number.isInteger(s["jumps"]) &&
    (s["jumps"] as number) >= 0
  );
}

export class LocalClock {
  private state: ClockState;
  private readonly tolerance: number;
  private readonly maxSyncAge: number;

  private constructor(
    private readonly source: ClockSource,
    state: ClockState,
    options: LocalClockOptions,
  ) {
    this.state = state;
    this.tolerance = options.jumpToleranceMs ?? DEFAULT_TOLERANCE_MS;
    this.maxSyncAge = options.maxSyncAgeMs ?? DEFAULT_MAX_SYNC_AGE_MS;
  }

  /** Starts a clock with no saved state. Sequence numbers start at 1. */
  static fresh(source: ClockSource, options: LocalClockOptions = {}): LocalClock {
    const monotonicMs = source.monotonicMs();
    const wallMs = source.wallMs();
    const bootId = source.bootId();
    checkReading(wallMs, monotonicMs, bootId);
    return new LocalClock(
      source,
      {
        bootId,
        lastMonotonicMs: monotonicMs,
        lastWallMs: wallMs,
        seq: 0,
        syncBootId: null,
        syncMonotonicMs: null,
        syncOffsetMs: 0,
        uncertain: false,
        jumps: 0,
      },
      options,
    );
  }

  /**
   * Restores a saved state. Corrupt or invalid state fails closed and nothing is created.
   * Sequence numbers continue from the saved value.
   */
  static restore(source: ClockSource, saved: unknown, options: LocalClockOptions = {}): LocalClock {
    if (!validState(saved)) {
      throw new ClockError("CLOCK_CORRUPT", "saved clock state is invalid");
    }
    return new LocalClock(source, { ...saved }, options);
  }

  /** Copy of the state to persist. */
  snapshot(): ClockState {
    return { ...this.state };
  }

  /** Stamps one event. Each call advances the sequence number. */
  stamp(): ClockReading {
    const wallMs = this.source.wallMs();
    const monotonicMs = this.source.monotonicMs();
    const bootId = this.source.bootId();
    // Validate before touching state, so a bad reading does not advance the sequence or corrupt
    // the last valid snapshot.
    checkReading(wallMs, monotonicMs, bootId);
    const s = this.state;

    let uncertain = s.uncertain;
    let jumps = s.jumps;

    if (bootId !== s.bootId) {
      // New boot: monotonic values are not comparable with the previous boot. Only a wall clock
      // that moved backwards across the reboot is a problem.
      if (wallMs < s.lastWallMs - this.tolerance) {
        uncertain = true;
        jumps += 1;
      }
    } else if (monotonicMs < s.lastMonotonicMs) {
      // Monotonic time went backwards inside one boot: the clock source is unreliable.
      uncertain = true;
      jumps += 1;
    } else {
      const elapsedMono = monotonicMs - s.lastMonotonicMs;
      const elapsedWall = wallMs - s.lastWallMs;
      // A suspend shows up as wall time advancing while monotonic time stalls. Both kinds of
      // mismatch (forward, backward, suspend) count as a jump when they exceed the tolerance.
      if (Math.abs(elapsedWall - elapsedMono) > this.tolerance) {
        uncertain = true;
        jumps += 1;
      }
    }

    const seq = s.seq + 1;
    this.state = {
      ...s,
      bootId,
      lastMonotonicMs: monotonicMs,
      lastWallMs: wallMs,
      seq,
      uncertain,
      jumps,
    };
    // Apply the last trusted sync offset when it came from this boot; otherwise report raw wall time.
    const anchored = this.state.syncBootId === bootId ? this.state.syncOffsetMs : 0;
    return {
      utcMs: wallMs + anchored,
      monotonicMs,
      bootId,
      seq,
      provenance: this.provenanceAt(monotonicMs, bootId, uncertain),
    };
  }

  /**
   * Applies a trusted time sync. The caller must have authenticated the sample: a sample is only
   * accepted when `authenticated` is exactly true at runtime. The sample is taken at
   * `monotonicMs` on this boot, so its UTC value is advanced by the monotonic time elapsed since
   * then before anchoring. Future, other-boot, and older-than-last-sync samples are rejected.
   * An applied sync clears UNCERTAIN, because it re-anchors the wall clock.
   */
  applySync(sample: TrustedSync): SyncResult {
    // Compile-time types are not a runtime check, so the flag is read as unknown.
    const flag: unknown = sample.authenticated;
    if (flag !== true) {
      return { status: "REJECTED", reason: "NOT_AUTHENTICATED" };
    }
    if (
      !isFiniteNumber(sample.utcMs) ||
      !isFiniteNumber(sample.monotonicMs) ||
      sample.monotonicMs < 0 ||
      typeof sample.bootId !== "string" ||
      sample.bootId === ""
    ) {
      return { status: "REJECTED", reason: "BAD_VALUE" };
    }
    const nowWall = this.source.wallMs();
    const nowMono = this.source.monotonicMs();
    const nowBoot = this.source.bootId();
    checkReading(nowWall, nowMono, nowBoot);
    if (sample.bootId !== this.state.bootId || sample.bootId !== nowBoot) {
      return { status: "REJECTED", reason: "OTHER_BOOT" };
    }
    if (sample.monotonicMs > nowMono) {
      return { status: "REJECTED", reason: "FUTURE_SAMPLE" };
    }
    if (this.state.syncMonotonicMs !== null && sample.monotonicMs < this.state.syncMonotonicMs) {
      return { status: "REJECTED", reason: "OLDER_THAN_LAST_SYNC" };
    }
    // UTC at the moment of application, given the sample was valid at sample.monotonicMs.
    const utcNow = sample.utcMs + (nowMono - sample.monotonicMs);
    this.state = {
      ...this.state,
      syncBootId: sample.bootId,
      syncMonotonicMs: sample.monotonicMs,
      syncOffsetMs: utcNow - nowWall,
      uncertain: false,
    };
    return { status: "APPLIED" };
  }

  private provenanceAt(monotonicMs: number, bootId: string, uncertain: boolean): Provenance {
    if (uncertain) return "UNCERTAIN";
    const s = this.state;
    if (s.syncMonotonicMs === null || s.syncBootId !== bootId) return "DEVICE_UNSYNCED";
    if (monotonicMs - s.syncMonotonicMs > this.maxSyncAge) return "STALE";
    return "SYNCED";
  }
}
