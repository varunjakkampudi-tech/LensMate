/**
 * Remote device lock and credential revocation (checklist B21).
 *
 * The owner can lock a device (reversible) or revoke it (terminal). The lock state is kept on the
 * device, so it is enforced while offline. Every command must be authenticated by the platform
 * adapter, must carry a strictly increasing issue time, and carries its own expiry. Replayed and
 * stale commands are refused, and every applied transition is recorded.
 *
 * Pure logic: no network, phone, or native code. The caller verifies the command's signature and
 * sets `authenticated` only after that check. This module checks the flag at runtime, because a
 * TypeScript literal type is not a runtime check.
 *
 * Clock trust: the device's wall clock is not authenticated. Commands dated in the future beyond a
 * skew allowance are refused. When the caller reports that the clock is UNCERTAIN or STALE (B20
 * provenance), an UNLOCK is refused, because unlocking is the direction that needs a trusted clock.
 * LOCK and REVOKE stay allowed, because they only make the device more restricted.
 *
 * Enrolment: `firstEnrollment` is the only way to create an ACTIVE state, and it must be used only
 * for a device that has never been enrolled. A failed restore must never fall back to it. A revoked
 * device stays revoked; re-enrolment means a new device identity, handled by the broker.
 */

export type LockStatus = "ACTIVE" | "LOCKED" | "REVOKED";
export type LockAction = "LOCK" | "UNLOCK" | "REVOKE";
export type ClockProvenance = "SYNCED" | "DEVICE_UNSYNCED" | "STALE" | "UNCERTAIN";

export interface LockCommand {
  readonly commandId: string;
  readonly deviceId: string;
  readonly action: LockAction;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  /** Must be exactly true. Set only by the platform after it verified the command's signature. */
  readonly authenticated: true;
}

export type RefusalReason =
  | "NOT_AUTHENTICATED"
  | "WRONG_DEVICE"
  | "EXPIRED"
  | "BAD_VALUE"
  | "REPLAY"
  | "STALE"
  | "FUTURE_COMMAND"
  | "CLOCK_UNTRUSTED"
  | "REVOKED_TERMINAL"
  | "NOT_ALLOWED";

export type LockResult =
  | { readonly status: "APPLIED"; readonly next: LockStatus }
  | { readonly status: "REFUSED"; readonly reason: RefusalReason };

export interface AuditEntry {
  readonly commandId: string;
  readonly action: LockAction;
  readonly from: LockStatus;
  readonly to: LockStatus;
  readonly atMs: number;
}

/** Persisted lock state. Save it after every applied command. */
export interface LockState {
  readonly deviceId: string;
  readonly status: LockStatus;
  readonly lastIssuedAtMs: number;
  readonly seenCommandIds: readonly string[];
  readonly audit: readonly AuditEntry[];
}

export type LockErrorCode = "LOCK_CORRUPT";

export class LockError extends Error {
  constructor(
    readonly code: LockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LockError";
  }
}

export interface DeviceLockOptions {
  /** Most recent command ids kept for replay detection. */
  readonly maxSeenCommands?: number;
  /** Most recent audit entries kept. */
  readonly maxAuditEntries?: number;
  /** How far in the future a command's issue time may be before it is refused. */
  readonly clockSkewMs?: number;
}

const DEFAULT_MAX_SEEN = 1024;
const DEFAULT_MAX_AUDIT = 256;
const DEFAULT_CLOCK_SKEW_MS = 60_000;
const STATUSES: readonly LockStatus[] = ["ACTIVE", "LOCKED", "REVOKED"];
const ACTIONS: readonly LockAction[] = ["LOCK", "UNLOCK", "REVOKE"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validState(value: unknown): value is LockState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (
    typeof s["deviceId"] !== "string" ||
    s["deviceId"] === "" ||
    typeof s["status"] !== "string" ||
    !(STATUSES as readonly string[]).includes(s["status"]) ||
    !isFiniteNumber(s["lastIssuedAtMs"]) ||
    !Array.isArray(s["seenCommandIds"]) ||
    !(s["seenCommandIds"] as unknown[]).every((id) => typeof id === "string") ||
    !Array.isArray(s["audit"])
  ) {
    return false;
  }
  return (s["audit"] as unknown[]).every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e["commandId"] === "string" &&
      typeof e["action"] === "string" &&
      (ACTIONS as readonly string[]).includes(e["action"]) &&
      typeof e["from"] === "string" &&
      (STATUSES as readonly string[]).includes(e["from"]) &&
      typeof e["to"] === "string" &&
      (STATUSES as readonly string[]).includes(e["to"]) &&
      isFiniteNumber(e["atMs"])
    );
  });
}

/** Deep copy, so callers can never reach the internal arrays or audit entries. */
function copyState(state: LockState): LockState {
  return {
    deviceId: state.deviceId,
    status: state.status,
    lastIssuedAtMs: state.lastIssuedAtMs,
    seenCommandIds: [...state.seenCommandIds],
    audit: state.audit.map((entry) => ({ ...entry })),
  };
}

export class DeviceLock {
  private state: LockState;
  private readonly maxSeen: number;
  private readonly maxAudit: number;
  private readonly clockSkewMs: number;

  private constructor(state: LockState, options: DeviceLockOptions) {
    this.state = copyState(state);
    this.maxSeen = options.maxSeenCommands ?? DEFAULT_MAX_SEEN;
    this.maxAudit = options.maxAuditEntries ?? DEFAULT_MAX_AUDIT;
    this.clockSkewMs = options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  }

  /**
   * First enrolment of a device that has never been enrolled. Starts ACTIVE. Do not call this after
   * a failed restore: a missing or corrupt saved state must stop the device, not reset it.
   */
  static firstEnrollment(deviceId: string, options: DeviceLockOptions = {}): DeviceLock {
    if (deviceId === "") {
      throw new LockError("LOCK_CORRUPT", "device id must not be empty");
    }
    return new DeviceLock(
      { deviceId, status: "ACTIVE", lastIssuedAtMs: 0, seenCommandIds: [], audit: [] },
      options,
    );
  }

  /** Restores a saved state. Invalid state throws LOCK_CORRUPT and nothing is created. */
  static restore(saved: unknown, options: DeviceLockOptions = {}): DeviceLock {
    if (!validState(saved)) {
      throw new LockError("LOCK_CORRUPT", "saved device lock state is invalid");
    }
    return new DeviceLock(saved, options);
  }

  /** A deep copy. Changing it does not change the lock. */
  snapshot(): LockState {
    return copyState(this.state);
  }

  /**
   * The operation gate. Allows only ACTIVE. It needs no network, and a corrupt state never reaches
   * it, because restore fails closed first.
   */
  check(): { readonly allowed: boolean; readonly status: LockStatus } {
    return { allowed: this.state.status === "ACTIVE", status: this.state.status };
  }

  /**
   * Applies one owner command at local time `nowMs`. `provenance` is the B20 status of the local
   * clock. It has no default: omitting it is treated as untrusted. Refused commands change nothing.
   */
  apply(command: LockCommand, nowMs: number, provenance?: ClockProvenance): LockResult {
    const flag: unknown = command.authenticated;
    if (flag !== true) return refuse("NOT_AUTHENTICATED");
    const action: unknown = command.action;
    if (
      typeof command.commandId !== "string" ||
      command.commandId === "" ||
      typeof action !== "string" ||
      !(ACTIONS as readonly string[]).includes(action) ||
      !isFiniteNumber(command.issuedAtMs) ||
      !isFiniteNumber(command.expiresAtMs) ||
      !isFiniteNumber(nowMs) ||
      command.expiresAtMs <= command.issuedAtMs
    ) {
      return refuse("BAD_VALUE");
    }
    if (command.deviceId !== this.state.deviceId) return refuse("WRONG_DEVICE");
    if (command.issuedAtMs > nowMs + this.clockSkewMs) return refuse("FUTURE_COMMAND");
    if (nowMs > command.expiresAtMs) return refuse("EXPIRED");
    if (this.state.seenCommandIds.includes(command.commandId)) return refuse("REPLAY");
    // Strictly increasing issue times: equal times are ambiguous, so they are refused.
    if (command.issuedAtMs <= this.state.lastIssuedAtMs) return refuse("STALE");

    const from = this.state.status;
    if (from === "REVOKED") return refuse("REVOKED_TERMINAL");

    // Re-read the action as a plain string: a malformed value must never reach the revoke branch.
    const kind: string = action;
    let to: LockStatus;
    if (kind === "LOCK") {
      if (from !== "ACTIVE") return refuse("NOT_ALLOWED");
      to = "LOCKED";
    } else if (kind === "UNLOCK") {
      if (from !== "LOCKED") return refuse("NOT_ALLOWED");
      // Only a verified, synchronized clock may unlock. Omitted, DEVICE_UNSYNCED, STALE, UNCERTAIN and
      // malformed values are all refused.
      if (provenance !== "SYNCED") return refuse("CLOCK_UNTRUSTED");
      to = "ACTIVE";
    } else if (kind === "REVOKE") {
      to = "REVOKED";
    } else {
      return refuse("BAD_VALUE");
    }

    const audit = [
      ...this.state.audit,
      { commandId: command.commandId, action: command.action, from, to, atMs: nowMs },
    ].slice(-this.maxAudit);
    const seen = [...this.state.seenCommandIds, command.commandId].slice(-this.maxSeen);
    this.state = {
      deviceId: this.state.deviceId,
      status: to,
      lastIssuedAtMs: command.issuedAtMs,
      seenCommandIds: seen,
      audit,
    };
    return { status: "APPLIED", next: to };
  }
}

function refuse(reason: RefusalReason): LockResult {
  return { status: "REFUSED", reason };
}
