import { NetworkRecovery } from "./network-recovery.js";
import type { Scheduler } from "./network-recovery.js";

/** Deterministic clock: timers fire only when `advance` moves time past their due time. */
class FakeScheduler implements Scheduler {
  now = 0;
  private timers: { due: number; task: () => void; cancelled: boolean }[] = [];

  setTimer(task: () => void, delayMs: number): () => void {
    const timer = { due: this.now + delayMs, task, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }

  get pendingCount(): number {
    return this.timers.filter((t) => !t.cancelled).length;
  }

  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    for (;;) {
      const next = this.timers
        .filter((t) => !t.cancelled && t.due <= target)
        .sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.now = next.due;
      next.cancelled = true;
      next.task();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/** A connect function whose outcome the test chooses for each attempt. */
function scriptedConnect() {
  const attempts: { signal: AbortSignal; resolve: () => void; reject: () => void }[] = [];
  const connect = (signal: AbortSignal): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      attempts.push({ signal, resolve, reject });
    });
  return { attempts, connect };
}

const noJitter = { jitterRatio: 0 };

describe("NetworkRecovery", () => {
  it("ignores repeated network reports with the same value", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 100,
    });
    recovery.start(false);
    recovery.reportNetwork(false);
    recovery.reportNetwork(false);
    expect(recovery.snapshot.state).toBe("OFFLINE");
    expect(sched.pendingCount).toBe(0);
    recovery.reportNetwork(true);
    recovery.reportNetwork(true);
    expect(sched.pendingCount).toBe(1);
    await sched.advance(100);
    expect(script.attempts).toHaveLength(1);
  });

  it("flap inside the stability window makes no attempt", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 500,
    });
    recovery.start(true);
    await sched.advance(200);
    recovery.reportNetwork(false);
    await sched.advance(1000);
    expect(script.attempts).toHaveLength(0);
    expect(recovery.snapshot.state).toBe("OFFLINE");
  });

  it("makes no connect attempt while offline", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 0,
      policy: { ...noJitter, baseDelayMs: 10 },
    });
    recovery.start(false);
    await sched.advance(10_000);
    expect(script.attempts).toHaveLength(0);
  });

  it("backs off exponentially with a cap and bounded jitter", async () => {
    await flush();
    const sched = new FakeScheduler();
    const recovery = new NetworkRecovery({
      connect: () => Promise.reject(new Error("down")),
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 0,
      random: () => 0.5,
      policy: { baseDelayMs: 100, factor: 2, maxDelayMs: 500, jitterRatio: 0.2 },
    });
    // Jitter adds at most jitterRatio of the delay: 0.5 * 0.2 = 10% extra.
    expect(recovery.backoffMs(1)).toBe(110);
    expect(recovery.backoffMs(2)).toBe(220);
    expect(recovery.backoffMs(3)).toBe(440);
    expect(recovery.backoffMs(4)).toBe(500);
    expect(recovery.backoffMs(10)).toBe(500);

    recovery.start(true);
    await sched.advance(0);
    expect(recovery.snapshot.failures).toBe(1);
    await sched.advance(109);
    expect(recovery.snapshot.failures).toBe(1);
    await sched.advance(1);
    expect(recovery.snapshot.failures).toBe(2);
  });

  it("a successful connect resets the failure count", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    let connected = 0;
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => {
        connected += 1;
      },
      scheduler: sched,
      stableOnlineMs: 0,
      policy: { ...noJitter, baseDelayMs: 100 },
    });
    recovery.start(true);
    await sched.advance(0);
    script.attempts[0]?.reject();
    await flush();
    expect(recovery.snapshot.failures).toBe(1);
    await sched.advance(100);
    script.attempts[1]?.resolve();
    await flush();
    expect(recovery.snapshot).toMatchObject({ state: "CONNECTED", failures: 0 });
    expect(connected).toBe(1);
  });

  it("returning online retries at once and cancels the pending backoff timer", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 50,
      policy: { ...noJitter, baseDelayMs: 10_000 },
    });
    recovery.start(true);
    await sched.advance(50);
    script.attempts[0]?.reject();
    await flush();
    expect(recovery.snapshot.state).toBe("OFFLINE");
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    await sched.advance(50);
    expect(script.attempts).toHaveLength(2);
    expect(recovery.snapshot.failures).toBe(0);
  });

  it("going offline aborts an in-flight attempt without counting a failure", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 0,
    });
    recovery.start(true);
    await sched.advance(0);
    expect(script.attempts).toHaveLength(1);
    recovery.reportNetwork(false);
    expect(script.attempts[0]?.signal.aborted).toBe(true);
    script.attempts[0]?.reject();
    await flush();
    expect(recovery.snapshot).toMatchObject({ state: "OFFLINE", failures: 0 });
  });

  it("a connect that finishes after going offline does not count as connected", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    let connected = 0;
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => {
        connected += 1;
      },
      scheduler: sched,
      stableOnlineMs: 0,
    });
    recovery.start(true);
    await sched.advance(0);
    recovery.reportNetwork(false);
    script.attempts[0]?.resolve();
    await flush();
    expect(connected).toBe(0);
    expect(recovery.snapshot.state).toBe("OFFLINE");
  });

  it("attempts never overlap", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 0,
    });
    recovery.start(true);
    await sched.advance(0);
    expect(script.attempts).toHaveLength(1);
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    await sched.advance(0);
    // The first connect ignores its abort signal and is still pending, so no second one starts.
    expect(script.attempts).toHaveLength(1);
    script.attempts[0]?.resolve();
    await flush();
    // Once the old connect settles, the pending retry runs (stale result, network still up).
    expect(script.attempts).toHaveLength(2);
    script.attempts[1]?.resolve();
    await flush();
    expect(recovery.snapshot.state).toBe("CONNECTED");
  });

  it("calls onConnected once per successful connect", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    let connected = 0;
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => {
        connected += 1;
      },
      scheduler: sched,
      stableOnlineMs: 0,
    });
    recovery.start(true);
    await sched.advance(0);
    script.attempts[0]?.resolve();
    await flush();
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    await sched.advance(0);
    script.attempts[1]?.resolve();
    await flush();
    expect(connected).toBe(2);
  });

  it("gives up after maxAttempts; retryNow resumes", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 0,
      policy: { ...noJitter, baseDelayMs: 10, maxAttempts: 2 },
    });
    recovery.start(true);
    await sched.advance(0);
    script.attempts[0]?.reject();
    await flush();
    await sched.advance(10);
    script.attempts[1]?.reject();
    await flush();
    expect(recovery.snapshot.state).toBe("GAVE_UP");
    expect(sched.pendingCount).toBe(0);
    await sched.advance(100_000);
    expect(script.attempts).toHaveLength(2);

    recovery.retryNow();
    await sched.advance(0);
    expect(script.attempts).toHaveLength(3);
  });

  it("stop cancels timers, aborts the in-flight attempt, and ignores late results", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    let connected = 0;
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => {
        connected += 1;
      },
      scheduler: sched,
      stableOnlineMs: 0,
    });
    recovery.start(true);
    await sched.advance(0);
    recovery.stop();
    expect(script.attempts[0]?.signal.aborted).toBe(true);
    script.attempts[0]?.resolve();
    await flush();
    await sched.advance(100_000);
    expect(connected).toBe(0);
    expect(recovery.snapshot.state).toBe("STOPPED");
    expect(script.attempts).toHaveLength(1);
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    await sched.advance(100_000);
    expect(script.attempts).toHaveLength(1);
  });
  it("CR-13: restart after stop starts a fresh session after a completed connection", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    let connected = 0;
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => {
        connected += 1;
      },
      scheduler: sched,
      stableOnlineMs: 100,
    });
    recovery.start(true);
    await sched.advance(100);
    script.attempts[0]?.resolve();
    await flush();
    expect(recovery.snapshot.state).toBe("CONNECTED");
    recovery.stop();
    recovery.start(true);
    await sched.advance(100);
    expect(script.attempts).toHaveLength(2);
    script.attempts[1]?.resolve();
    await flush();
    expect(connected).toBe(2);
    expect(recovery.snapshot.state).toBe("CONNECTED");
  });

  it("CR-13: restart while the previous connect ignores abort keeps one slot and retries once it settles", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 100,
    });
    recovery.start(true);
    await sched.advance(100);
    expect(script.attempts).toHaveLength(1);
    recovery.stop();
    recovery.start(true);
    await sched.advance(500);
    // The old connect ignores its abort signal and is still pending: no second connect yet.
    expect(script.attempts).toHaveLength(1);
    script.attempts[0]?.reject();
    await flush();
    expect(script.attempts).toHaveLength(2);
    script.attempts[1]?.resolve();
    await flush();
    expect(recovery.snapshot.state).toBe("CONNECTED");
  });

  it("CR-13: offline restart followed by online recovery attempts once", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 50,
    });
    recovery.start(true);
    await sched.advance(50);
    script.attempts[0]?.resolve();
    await flush();
    recovery.stop();
    recovery.start(false);
    await sched.advance(1000);
    expect(script.attempts).toHaveLength(1);
    recovery.reportNetwork(true);
    await sched.advance(50);
    expect(script.attempts).toHaveLength(2);
  });

  it("CR-14: a late settle before the stability window does not bypass it", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 500,
    });
    recovery.start(true);
    await sched.advance(500);
    expect(script.attempts).toHaveLength(1);
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    // Old connect settles (aborted) before the new stability window has passed.
    script.attempts[0]?.reject();
    await flush();
    expect(script.attempts).toHaveLength(1);
    await sched.advance(499);
    expect(script.attempts).toHaveLength(1);
    await sched.advance(1);
    expect(script.attempts).toHaveLength(2);
    script.attempts[1]?.resolve();
    await flush();
    expect(recovery.snapshot.state).toBe("CONNECTED");
  });

  it("CR-14: a late settle after the stability window retries exactly once", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 100,
    });
    recovery.start(true);
    await sched.advance(100);
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    await sched.advance(100);
    // Stability passed while the old connect was still pending: nothing new yet.
    expect(script.attempts).toHaveLength(1);
    script.attempts[0]?.reject();
    await flush();
    expect(script.attempts).toHaveLength(2);
    await sched.advance(10_000);
    expect(script.attempts).toHaveLength(2);
  });

  it("CR-14: stop prevents a late retry from an old connect", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => undefined,
      scheduler: sched,
      stableOnlineMs: 100,
    });
    recovery.start(true);
    await sched.advance(100);
    recovery.reportNetwork(false);
    recovery.reportNetwork(true);
    await sched.advance(100);
    recovery.stop();
    script.attempts[0]?.reject();
    await flush();
    await sched.advance(10_000);
    expect(script.attempts).toHaveLength(1);
  });

  it("CR-15: an exception thrown by onConnected is reported and leaves the connection CONNECTED", async () => {
    await flush();
    const sched = new FakeScheduler();
    const script = scriptedConnect();
    const errors: unknown[] = [];
    const boom = new Error("sync failed");
    const recovery = new NetworkRecovery({
      connect: script.connect,
      onConnected: () => {
        throw boom;
      },
      onCallbackError: (error) => {
        errors.push(error);
      },
      scheduler: sched,
      stableOnlineMs: 0,
    });
    recovery.start(true);
    await sched.advance(0);
    script.attempts[0]?.resolve();
    await flush();
    expect(errors).toEqual([boom]);
    expect(recovery.snapshot).toMatchObject({ state: "CONNECTED", failures: 0 });
    await sched.advance(100_000);
    expect(script.attempts).toHaveLength(1);
  });
});
