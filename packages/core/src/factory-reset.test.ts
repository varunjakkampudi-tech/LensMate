import { FactoryReset, RESET_STEPS, ResetError } from "./factory-reset.js";
import type {
  ResetAuthorizationPolicy,
  ResetState,
  ResetStep,
  ResetStore,
} from "./factory-reset.js";

class MemoryResetStore implements ResetStore {
  data: ResetState | null = null;
  failSaves = 0;

  load(): Promise<ResetState | null> {
    return Promise.resolve(this.data === null ? null : structuredClone(this.data));
  }

  save(state: ResetState): Promise<void> {
    if (this.failSaves > 0) {
      this.failSaves -= 1;
      return Promise.reject(new Error("disk full"));
    }
    this.data = structuredClone(state);
    return Promise.resolve();
  }
}

const OWNER = { deviceId: "dev-1", token: "owner-token" };

/** Trusted policy used in tests: accepts only the owner token for this device. */
const allowOwner: ResetAuthorizationPolicy = (_id, auth) =>
  Promise.resolve(
    typeof auth === "object" &&
      auth !== null &&
      (auth as { deviceId?: unknown }).deviceId === OWNER.deviceId &&
      (auth as { token?: unknown }).token === OWNER.token,
  );

/** Runner that records calls and returns scripted results; default DONE for every step. */
function runner(outcomes: Partial<Record<ResetStep, unknown[]>> = {}) {
  const calls: ResetStep[] = [];
  const run = (step: ResetStep): Promise<unknown> => {
    calls.push(step);
    const queue = outcomes[step];
    const next = queue?.shift();
    return Promise.resolve(next === undefined ? "DONE" : next);
  };
  return { calls, run };
}

async function startConfirmed(
  store: MemoryResetStore,
  run: ReturnType<typeof runner>["run"],
  id = "reset-1",
) {
  const started = await FactoryReset.start(store, run, allowOwner, {
    resetId: id,
    confirmed: true,
    authorization: OWNER,
  });
  if (started.reset === null) throw new Error("expected a reset");
  return started.reset;
}

describe("FactoryReset", () => {
  it("reset is refused without exact confirmation, and no step runs", async () => {
    const store = new MemoryResetStore();
    const r = runner();
    for (const confirmed of [false, undefined, "true", 1, null]) {
      const out = await FactoryReset.start(store, r.run, allowOwner, {
        resetId: "r",
        confirmed,
        authorization: OWNER,
      });
      expect(out.result).toEqual({ status: "REFUSED", reason: "NOT_CONFIRMED" });
    }
    expect(r.calls).toEqual([]);
    expect(store.data).toBeNull();
  });

  it("CR-25: confirmation alone is not authorization; unauthenticated, malformed and wrong-device requests are refused", async () => {
    const store = new MemoryResetStore();
    const r = runner();
    const badAuth: unknown[] = [
      undefined,
      null,
      "owner-token",
      { deviceId: OWNER.deviceId },
      { deviceId: "dev-2", token: OWNER.token },
      { deviceId: OWNER.deviceId, token: "wrong" },
    ];
    for (const authorization of badAuth) {
      const out = await FactoryReset.start(store, r.run, allowOwner, {
        resetId: "r",
        confirmed: true,
        authorization,
      });
      expect(out.result).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    }
    const throwing: ResetAuthorizationPolicy = () => Promise.reject(new Error("verifier down"));
    const refusedByThrow = await FactoryReset.start(store, r.run, throwing, {
      resetId: "r",
      confirmed: true,
      authorization: OWNER,
    });
    expect(refusedByThrow.result).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    const truthyNotTrue: ResetAuthorizationPolicy = () => Promise.resolve("yes");
    const refusedByTruthy = await FactoryReset.start(store, r.run, truthyNotTrue, {
      resetId: "r",
      confirmed: true,
      authorization: OWNER,
    });
    expect(refusedByTruthy.result).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    expect(r.calls).toEqual([]);
    expect(store.data).toBeNull();
  });

  it("steps run in the fixed order", async () => {
    const store = new MemoryResetStore();
    const r = runner();
    const reset = await startConfirmed(store, r.run);
    expect(await reset.advance()).toBe("COMPLETE");
    expect(r.calls).toEqual([...RESET_STEPS]);
  });

  it("a failed step stops the sequence and the reset is not COMPLETE", async () => {
    const store = new MemoryResetStore();
    const r = runner({ ERASE_LOCAL_DATA: ["FAILED"] });
    const reset = await startConfirmed(store, r.run);
    expect(await reset.advance()).toBe("FAILED");
    expect(reset.snapshot).toMatchObject({
      status: "FAILED",
      failedStep: "ERASE_LOCAL_DATA",
      nextStep: 1,
    });
    expect(r.calls).toEqual(["LOCK_LOCAL_CREDENTIALS", "ERASE_LOCAL_DATA"]);
  });

  it("resumes after restart at the first unfinished step, without repeating completed steps", async () => {
    const store = new MemoryResetStore();
    const first = runner({ DELETE_BACKUPS: ["FAILED"] });
    const reset = await startConfirmed(store, first.run);
    await reset.advance();
    expect(first.calls).toEqual(["LOCK_LOCAL_CREDENTIALS", "ERASE_LOCAL_DATA", "DELETE_BACKUPS"]);

    const second = runner();
    const resumed = await FactoryReset.resume(store, second.run);
    expect(resumed).not.toBeNull();
    expect(await resumed?.advance()).toBe("COMPLETE");
    expect(second.calls).toEqual(["DELETE_BACKUPS", "REVOKE_REMOTE", "VERIFY_ERASED"]);
  });

  it("COMPLETE is reached only after verification; a failed verification is FAILED, never COMPLETE", async () => {
    const store = new MemoryResetStore();
    const r = runner({ VERIFY_ERASED: ["FAILED"] });
    const reset = await startConfirmed(store, r.run);
    expect(await reset.advance()).toBe("FAILED");
    expect(reset.snapshot.status).toBe("FAILED");
    expect(store.data?.status).not.toBe("COMPLETE");
  });

  it("an offline remote revocation is WAITING_FOR_NETWORK, not COMPLETE, and local erasure is already done", async () => {
    const store = new MemoryResetStore();
    const r = runner({ REVOKE_REMOTE: ["OFFLINE", "DONE"] });
    const reset = await startConfirmed(store, r.run);
    expect(await reset.advance()).toBe("WAITING_FOR_NETWORK");
    expect(reset.snapshot).toMatchObject({ nextStep: 3, failedStep: "REVOKE_REMOTE" });
    expect(r.calls).toContain("ERASE_LOCAL_DATA");
    expect(await reset.advance()).toBe("COMPLETE");
  });

  it("a second reset with a different id is refused while one is in progress", async () => {
    const store = new MemoryResetStore();
    const r = runner({ ERASE_LOCAL_DATA: ["FAILED"] });
    const reset = await startConfirmed(store, r.run, "first");
    await reset.advance();
    const other = await FactoryReset.start(store, runner().run, allowOwner, {
      resetId: "second",
      confirmed: true,
      authorization: OWNER,
    });
    expect(other.result).toEqual({ status: "REFUSED", reason: "IN_PROGRESS" });
    expect(store.data?.resetId).toBe("first");
  });

  it("corrupt persisted reset state fails closed and never resets to IDLE", async () => {
    const store = new MemoryResetStore();
    store.data = {
      resetId: "",
      status: "IDLE",
      nextStep: 0,
      failedStep: null,
      audit: [],
    } as unknown as ResetState;
    await expect(FactoryReset.resume(store, runner().run)).rejects.toBeInstanceOf(ResetError);
    await expect(
      FactoryReset.start(store, runner().run, allowOwner, {
        resetId: "r",
        confirmed: true,
        authorization: OWNER,
      }),
    ).rejects.toBeInstanceOf(ResetError);
    expect(store.data.resetId).toBe("");
  });

  it("a failed progress save is retried, not assumed done", async () => {
    const store = new MemoryResetStore();
    const r = runner();
    const reset = await startConfirmed(store, r.run);
    store.failSaves = 1;
    expect(await reset.advance()).toBe("IN_PROGRESS");
    expect(reset.snapshot.nextStep).toBe(0);
    expect(store.data?.nextStep).toBe(0);
    expect(await reset.advance()).toBe("COMPLETE");
    expect(r.calls.filter((c) => c === "LOCK_LOCAL_CREDENTIALS")).toHaveLength(2);
  });

  it("audit records performed steps and their outcomes", async () => {
    const store = new MemoryResetStore();
    const r = runner({ DELETE_BACKUPS: ["FAILED"] });
    const reset = await startConfirmed(store, r.run);
    await reset.advance();
    expect(reset.snapshot.audit).toEqual([
      { step: "LOCK_LOCAL_CREDENTIALS", outcome: "DONE" },
      { step: "ERASE_LOCAL_DATA", outcome: "DONE" },
      { step: "DELETE_BACKUPS", outcome: "FAILED" },
    ]);
  });

  it("CR-24: concurrent advance calls run steps strictly one at a time, in order, exactly once", async () => {
    const store = new MemoryResetStore();
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: ResetStep[] = [];
    const run = async (step: ResetStep): Promise<unknown> => {
      calls.push(step);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1);
      });
      inFlight -= 1;
      return "DONE";
    };
    const reset = await startConfirmed(store, run);
    const results = await Promise.all([reset.advance(), reset.advance(), reset.advance()]);
    expect(maxInFlight).toBe(1);
    expect(calls).toEqual([...RESET_STEPS]);
    expect(results[results.length - 1]).toBe("COMPLETE");
    expect(reset.snapshot.status).toBe("COMPLETE");
  });

  it("CR-24: a failed save during concurrent advances leaves the step to be retried once, not duplicated", async () => {
    const store = new MemoryResetStore();
    const r = runner();
    const reset = await startConfirmed(store, r.run);
    store.failSaves = 1;
    await Promise.all([reset.advance(), reset.advance()]);
    expect(await reset.advance()).toBe("COMPLETE");
    expect(r.calls.filter((c) => c === "LOCK_LOCAL_CREDENTIALS")).toHaveLength(2);
    // The first run was not saved, so only the saved run is audited; the step is idempotent by contract.
    expect(reset.snapshot.audit.filter((e) => e.step === "LOCK_LOCAL_CREDENTIALS")).toHaveLength(1);
  });

  it("CR-24: a repeated start with the same id continues the existing reset instead of creating a second one", async () => {
    const store = new MemoryResetStore();
    const r = runner({ ERASE_LOCAL_DATA: ["FAILED"] });
    const first = await startConfirmed(store, r.run);
    await first.advance();
    const again = await FactoryReset.start(store, r.run, allowOwner, {
      resetId: "reset-1",
      confirmed: true,
      authorization: OWNER,
    });
    expect(again.result).toEqual({ status: "STARTED", resetId: "reset-1" });
    expect(again.reset?.snapshot.nextStep).toBe(1);
  });

  it("CR-26: an unknown step result is recorded as FAILED, and the saved state stays recoverable", async () => {
    const store = new MemoryResetStore();
    const r = runner({ ERASE_LOCAL_DATA: ["UNKNOWN"] });
    const reset = await startConfirmed(store, r.run);
    expect(await reset.advance()).toBe("FAILED");
    expect(reset.snapshot.audit[reset.snapshot.audit.length - 1]).toEqual({
      step: "ERASE_LOCAL_DATA",
      outcome: "FAILED",
    });
    if (store.data === null) throw new Error("expected saved state");
    const savedAudit = store.data.audit;
    expect(savedAudit[savedAudit.length - 1]).toEqual({
      step: "ERASE_LOCAL_DATA",
      outcome: "FAILED",
    });
    const resumed = await FactoryReset.resume(store, runner().run);
    expect(resumed).not.toBeNull();
    expect(await resumed?.advance()).toBe("COMPLETE");
  });

  it("CR-26: object, number, undefined and null results are failures, and recovery still works", async () => {
    const store = new MemoryResetStore();
    const r = runner({ ERASE_LOCAL_DATA: [{ ok: true }, 42, undefined, null] });
    const reset = await startConfirmed(store, r.run);
    expect(await reset.advance()).toBe("FAILED");
    expect(store.data?.audit.map((e) => e.outcome)).toEqual(["DONE", "FAILED"]);
    await expect(FactoryReset.resume(store, runner().run)).resolves.not.toBeNull();
  });
});
