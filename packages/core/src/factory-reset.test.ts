import { FactoryReset, RESET_STEPS, ResetError } from "./factory-reset.js";
import type { ResetState, ResetStep, ResetStore, StepOutcome } from "./factory-reset.js";

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

/** Runner that records calls and returns scripted outcomes; default DONE for every step. */
function runner(outcomes: Partial<Record<ResetStep, StepOutcome[]>> = {}) {
  const calls: ResetStep[] = [];
  const run = (step: ResetStep): Promise<StepOutcome> => {
    calls.push(step);
    const queue = outcomes[step];
    const next = queue?.shift();
    return Promise.resolve(next ?? "DONE");
  };
  return { calls, run };
}

async function startConfirmed(
  store: MemoryResetStore,
  run: ReturnType<typeof runner>["run"],
  id = "reset-1",
) {
  const started = await FactoryReset.start(store, run, { resetId: id, confirmed: true });
  if (started.reset === null) throw new Error("expected a reset");
  return started.reset;
}

describe("FactoryReset", () => {
  it("reset is refused without exact confirmation, and no step runs", async () => {
    const store = new MemoryResetStore();
    const r = runner();
    for (const confirmed of [false, undefined, "true", 1, null]) {
      const out = await FactoryReset.start(store, r.run, { resetId: "r", confirmed });
      expect(out.result).toEqual({ status: "REFUSED", reason: "NOT_CONFIRMED" });
    }
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
    const other = await FactoryReset.start(store, runner().run, {
      resetId: "second",
      confirmed: true,
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
      FactoryReset.start(store, runner().run, { resetId: "r", confirmed: true }),
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
});
