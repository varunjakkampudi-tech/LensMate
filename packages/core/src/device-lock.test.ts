import { DeviceLock, LockError } from "./device-lock.js";
import type { LockCommand } from "./device-lock.js";

const DEVICE = "dev-1";

function cmd(
  action: LockCommand["action"],
  overrides: Partial<LockCommand> & { issuedAtMs?: number } = {},
): LockCommand {
  const issuedAtMs = overrides.issuedAtMs ?? 1_000;
  return {
    commandId: overrides.commandId ?? `${action}-${String(issuedAtMs)}`,
    deviceId: overrides.deviceId ?? DEVICE,
    action,
    issuedAtMs,
    expiresAtMs: overrides.expiresAtMs ?? issuedAtMs + 60_000,
    authenticated: true,
  };
}

describe("DeviceLock", () => {
  it("LOCK denies operations and the state survives restart", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.check().allowed).toBe(true);
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100)).toEqual({
      status: "APPLIED",
      next: "LOCKED",
    });
    expect(lock.check()).toEqual({ allowed: false, status: "LOCKED" });
    const restored = DeviceLock.restore(JSON.parse(JSON.stringify(lock.snapshot())) as unknown);
    expect(restored.check()).toEqual({ allowed: false, status: "LOCKED" });
  });

  it("UNLOCK restores only from LOCKED; UNLOCK while ACTIVE is refused", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 1_000 }), 1_100)).toEqual({
      status: "REFUSED",
      reason: "NOT_ALLOWED",
    });
    lock.apply(cmd("LOCK", { issuedAtMs: 2_000 }), 2_100);
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 3_000 }), 3_100, "SYNCED")).toEqual({
      status: "APPLIED",
      next: "ACTIVE",
    });
    expect(lock.check().allowed).toBe(true);
  });

  it("REVOKE is terminal", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.apply(cmd("REVOKE", { issuedAtMs: 1_000 }), 1_100)).toEqual({
      status: "APPLIED",
      next: "REVOKED",
    });
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 2_000 }), 2_100)).toEqual({
      status: "REFUSED",
      reason: "REVOKED_TERMINAL",
    });
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 3_000 }), 3_100)).toEqual({
      status: "REFUSED",
      reason: "REVOKED_TERMINAL",
    });
    expect(lock.check()).toEqual({ allowed: false, status: "REVOKED" });
  });

  it("an unauthenticated command is refused at runtime, whatever the flag value", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    const flags: unknown[] = [false, undefined, "true", 1, null];
    for (const flag of flags) {
      const bad = { ...cmd("LOCK"), authenticated: flag } as unknown as LockCommand;
      expect(lock.apply(bad, 1_100)).toEqual({ status: "REFUSED", reason: "NOT_AUTHENTICATED" });
    }
    expect(lock.check().allowed).toBe(true);
  });

  it("a command for another device is refused", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.apply(cmd("LOCK", { deviceId: "dev-2" }), 1_100)).toEqual({
      status: "REFUSED",
      reason: "WRONG_DEVICE",
    });
  });

  it("expired commands are refused; an expiry not after issue time is refused as BAD_VALUE", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 1_000, expiresAtMs: 2_000 }), 2_001)).toEqual({
      status: "REFUSED",
      reason: "EXPIRED",
    });
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 5_000, expiresAtMs: 5_000 }), 5_100)).toEqual({
      status: "REFUSED",
      reason: "BAD_VALUE",
    });
    expect(lock.check().allowed).toBe(true);
  });

  it("replayed command ids are refused, and commands older than the last applied one are STALE", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    const lockCmd = cmd("LOCK", { issuedAtMs: 2_000, commandId: "c-1" });
    expect(lock.apply(lockCmd, 2_100).status).toBe("APPLIED");
    expect(lock.apply(lockCmd, 2_200)).toEqual({ status: "REFUSED", reason: "REPLAY" });
    expect(
      lock.apply(cmd("UNLOCK", { issuedAtMs: 1_500, commandId: "old-unlock" }), 2_300),
    ).toEqual({ status: "REFUSED", reason: "STALE" });
    expect(lock.check().allowed).toBe(false);
  });

  it("audit records applied transitions only, not refused commands", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000, commandId: "a" }), 1_100);
    lock.apply(cmd("LOCK", { issuedAtMs: 2_000, commandId: "b" }), 2_100);
    lock.apply(cmd("UNLOCK", { issuedAtMs: 3_000, commandId: "c" }), 3_100, "SYNCED");
    expect(lock.snapshot().audit).toEqual([
      { commandId: "a", action: "LOCK", from: "ACTIVE", to: "LOCKED", atMs: 1_100 },
      { commandId: "c", action: "UNLOCK", from: "LOCKED", to: "ACTIVE", atMs: 3_100 },
    ]);
  });

  it("corrupt or invalid saved state fails closed with LOCK_CORRUPT", () => {
    const valid = DeviceLock.firstEnrollment(DEVICE).snapshot();
    const bad: unknown[] = [
      null,
      { ...valid, status: "OPEN" },
      { ...valid, deviceId: "" },
      { ...valid, seenCommandIds: [1] },
      { ...valid, audit: [{ commandId: "x" }] },
      { ...valid, lastIssuedAtMs: "1000" },
    ];
    for (const saved of bad) {
      expect(() => DeviceLock.restore(saved)).toThrow(LockError);
    }
    expect.assertions(bad.length + 2);
    try {
      DeviceLock.restore(bad[1]);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LockError);
      expect((error as LockError).code).toBe("LOCK_CORRUPT");
    }
  });

  it("offline: a lock applied earlier is enforced with no connectivity", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100);
    const saved = JSON.parse(JSON.stringify(lock.snapshot())) as unknown;
    // Restart with no network at all: the gate depends only on the saved state.
    const offline = DeviceLock.restore(saved);
    expect(offline.check().allowed).toBe(false);
  });
  it("CR-19: an unknown action is refused as BAD_VALUE and never revokes or changes state", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    const bad = { ...cmd("LOCK"), action: "UNKNOWN" } as unknown as LockCommand;
    expect(lock.apply(bad, 1_100)).toEqual({ status: "REFUSED", reason: "BAD_VALUE" });
    expect(lock.check()).toEqual({ allowed: true, status: "ACTIVE" });
    expect(lock.snapshot().audit).toEqual([]);
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 2_000 }), 2_100).status).toBe("APPLIED");
  });

  it("CR-20: snapshots are deep copies; mutating them cannot change replay protection or the audit", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000, commandId: "c-1" }), 1_100);
    // Simulate a caller that ignores the readonly types and mutates the returned object at runtime.
    const copy = lock.snapshot() as unknown as {
      seenCommandIds: string[];
      audit: { commandId: string; action: string; from: string; to: string; atMs: number }[];
    };
    copy.seenCommandIds.length = 0;
    copy.audit.push({
      commandId: "forged",
      action: "UNLOCK",
      from: "LOCKED",
      to: "ACTIVE",
      atMs: 0,
    });
    const first = copy.audit[0];
    if (first !== undefined) first.commandId = "tampered";
    const fresh = lock.snapshot();
    expect(fresh.seenCommandIds).toEqual(["c-1"]);
    expect(fresh.audit.map((e) => e.commandId)).toEqual(["c-1"]);
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 1_500, commandId: "c-1" }), 1_600)).toEqual({
      status: "REFUSED",
      reason: "REPLAY",
    });
  });

  it("CR-20: restored state is copied, so later edits to the input object cannot change the lock", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100);
    const saved = JSON.parse(JSON.stringify(lock.snapshot())) as {
      status: string;
      seenCommandIds: string[];
    };
    const restored = DeviceLock.restore(saved);
    saved.status = "ACTIVE";
    saved.seenCommandIds.length = 0;
    expect(restored.check()).toEqual({ allowed: false, status: "LOCKED" });
  });

  it("CR-21: a command dated beyond the clock-skew allowance is refused and does not move ordering", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE, { clockSkewMs: 60_000 });
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 1_000_000_000 }), 1_000)).toEqual({
      status: "REFUSED",
      reason: "FUTURE_COMMAND",
    });
    expect(lock.snapshot().lastIssuedAtMs).toBe(0);
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 2_000 }), 2_100).status).toBe("APPLIED");
  });

  it("CR-21: equal issue times are refused as STALE, so ordering is never ambiguous", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 5_000, commandId: "a" }), 5_100).status).toBe(
      "APPLIED",
    );
    expect(lock.apply(cmd("REVOKE", { issuedAtMs: 5_000, commandId: "b" }), 5_200)).toEqual({
      status: "REFUSED",
      reason: "STALE",
    });
    expect(lock.check().status).toBe("LOCKED");
  });

  it("CR-21: with an untrusted clock, UNLOCK is refused, while LOCK and REVOKE are still applied", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    expect(lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100, "UNCERTAIN").status).toBe(
      "APPLIED",
    );
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 2_000 }), 2_100, "UNCERTAIN")).toEqual({
      status: "REFUSED",
      reason: "CLOCK_UNTRUSTED",
    });
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 2_000 }), 2_100, "STALE")).toEqual({
      status: "REFUSED",
      reason: "CLOCK_UNTRUSTED",
    });
    expect(lock.check().status).toBe("LOCKED");
    expect(lock.apply(cmd("REVOKE", { issuedAtMs: 3_000 }), 3_100, "UNCERTAIN").status).toBe(
      "APPLIED",
    );
  });

  it("CR-22: a failed restore never produces an ACTIVE device; locked and revoked states stay locked and revoked", () => {
    expect(() => DeviceLock.restore(null)).toThrow(LockError);
    expect(() => DeviceLock.firstEnrollment("")).toThrow(LockError);
    const locked = DeviceLock.firstEnrollment(DEVICE);
    locked.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100);
    expect(
      DeviceLock.restore(JSON.parse(JSON.stringify(locked.snapshot())) as unknown).check().allowed,
    ).toBe(false);
    const revoked = DeviceLock.firstEnrollment(DEVICE);
    revoked.apply(cmd("REVOKE", { issuedAtMs: 1_000 }), 1_100);
    const restoredRevoked = DeviceLock.restore(
      JSON.parse(JSON.stringify(revoked.snapshot())) as unknown,
    );
    expect(restoredRevoked.check()).toEqual({ allowed: false, status: "REVOKED" });
    expect(restoredRevoked.apply(cmd("UNLOCK", { issuedAtMs: 2_000 }), 2_100)).toEqual({
      status: "REFUSED",
      reason: "REVOKED_TERMINAL",
    });
  });
  it("CR-23: omitted, DEVICE_UNSYNCED, STALE, UNCERTAIN and invalid provenance cannot unlock; only SYNCED can", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100);
    const before = lock.snapshot();
    const refusals: unknown[] = [
      undefined,
      "DEVICE_UNSYNCED",
      "STALE",
      "UNCERTAIN",
      "synced",
      "",
      1,
      null,
    ];
    let issued = 2_000;
    for (const provenance of refusals) {
      issued += 1_000;
      const result = lock.apply(
        cmd("UNLOCK", { issuedAtMs: issued }),
        issued + 100,
        provenance as Parameters<DeviceLock["apply"]>[2],
      );
      expect(result).toEqual({ status: "REFUSED", reason: "CLOCK_UNTRUSTED" });
    }
    expect(lock.snapshot()).toEqual(before);
    expect(lock.check()).toEqual({ allowed: false, status: "LOCKED" });
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 9_000 }), 9_100, "SYNCED")).toEqual({
      status: "APPLIED",
      next: "ACTIVE",
    });
  });

  it("CR-23: refused unlocks leave replay history unchanged, so the same command id can still be used once trusted", () => {
    const lock = DeviceLock.firstEnrollment(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100);
    const unlock = cmd("UNLOCK", { issuedAtMs: 2_000, commandId: "u-1" });
    expect(lock.apply(unlock, 2_100, "DEVICE_UNSYNCED")).toEqual({
      status: "REFUSED",
      reason: "CLOCK_UNTRUSTED",
    });
    expect(lock.snapshot().seenCommandIds).not.toContain("u-1");
    expect(lock.snapshot().lastIssuedAtMs).toBe(1_000);
    expect(lock.apply(unlock, 2_100, "SYNCED").status).toBe("APPLIED");
  });
});
