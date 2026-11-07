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
    const lock = DeviceLock.fresh(DEVICE);
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
    const lock = DeviceLock.fresh(DEVICE);
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 1_000 }), 1_100)).toEqual({
      status: "REFUSED",
      reason: "NOT_ALLOWED",
    });
    lock.apply(cmd("LOCK", { issuedAtMs: 2_000 }), 2_100);
    expect(lock.apply(cmd("UNLOCK", { issuedAtMs: 3_000 }), 3_100)).toEqual({
      status: "APPLIED",
      next: "ACTIVE",
    });
    expect(lock.check().allowed).toBe(true);
  });

  it("REVOKE is terminal", () => {
    const lock = DeviceLock.fresh(DEVICE);
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
    const lock = DeviceLock.fresh(DEVICE);
    const flags: unknown[] = [false, undefined, "true", 1, null];
    for (const flag of flags) {
      const bad = { ...cmd("LOCK"), authenticated: flag } as unknown as LockCommand;
      expect(lock.apply(bad, 1_100)).toEqual({ status: "REFUSED", reason: "NOT_AUTHENTICATED" });
    }
    expect(lock.check().allowed).toBe(true);
  });

  it("a command for another device is refused", () => {
    const lock = DeviceLock.fresh(DEVICE);
    expect(lock.apply(cmd("LOCK", { deviceId: "dev-2" }), 1_100)).toEqual({
      status: "REFUSED",
      reason: "WRONG_DEVICE",
    });
  });

  it("expired commands are refused; an expiry not after issue time is refused as BAD_VALUE", () => {
    const lock = DeviceLock.fresh(DEVICE);
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
    const lock = DeviceLock.fresh(DEVICE);
    const lockCmd = cmd("LOCK", { issuedAtMs: 2_000, commandId: "c-1" });
    expect(lock.apply(lockCmd, 2_100).status).toBe("APPLIED");
    expect(lock.apply(lockCmd, 2_200)).toEqual({ status: "REFUSED", reason: "REPLAY" });
    expect(
      lock.apply(cmd("UNLOCK", { issuedAtMs: 1_500, commandId: "old-unlock" }), 2_300),
    ).toEqual({ status: "REFUSED", reason: "STALE" });
    expect(lock.check().allowed).toBe(false);
  });

  it("audit records applied transitions only, not refused commands", () => {
    const lock = DeviceLock.fresh(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000, commandId: "a" }), 1_100);
    lock.apply(cmd("LOCK", { issuedAtMs: 2_000, commandId: "b" }), 2_100);
    lock.apply(cmd("UNLOCK", { issuedAtMs: 3_000, commandId: "c" }), 3_100);
    expect(lock.snapshot().audit).toEqual([
      { commandId: "a", action: "LOCK", from: "ACTIVE", to: "LOCKED", atMs: 1_100 },
      { commandId: "c", action: "UNLOCK", from: "LOCKED", to: "ACTIVE", atMs: 3_100 },
    ]);
  });

  it("corrupt or invalid saved state fails closed with LOCK_CORRUPT", () => {
    const valid = DeviceLock.fresh(DEVICE).snapshot();
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
    expect.assertions(2);
    try {
      DeviceLock.restore(bad[1]);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LockError);
      expect((error as LockError).code).toBe("LOCK_CORRUPT");
    }
  });

  it("offline: a lock applied earlier is enforced with no connectivity", () => {
    const lock = DeviceLock.fresh(DEVICE);
    lock.apply(cmd("LOCK", { issuedAtMs: 1_000 }), 1_100);
    const saved = JSON.parse(JSON.stringify(lock.snapshot())) as unknown;
    // Restart with no network at all: the gate depends only on the saved state.
    const offline = DeviceLock.restore(saved);
    expect(offline.check().allowed).toBe(false);
  });
});
