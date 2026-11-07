import { ClockError, LocalClock } from "./local-clock.js";
import type { ClockSource } from "./local-clock.js";

/** Injected clock. Wall and monotonic time move independently, so jumps and suspends can be modelled. */
class FakeClock implements ClockSource {
  wall = 1_700_000_000_000;
  mono = 0;
  boot = "boot-1";

  wallMs(): number {
    return this.wall;
  }
  monotonicMs(): number {
    return this.mono;
  }
  bootId(): string {
    return this.boot;
  }
  /** Normal passage of time: both clocks move together. */
  tick(ms: number): void {
    this.wall += ms;
    this.mono += ms;
  }
  /** Wall clock is changed by the user or by a sync; monotonic is unaffected. */
  jumpWall(ms: number): void {
    this.wall += ms;
  }
  /** Device suspended: monotonic stalls while wall time keeps going. */
  suspend(wallMs: number): void {
    this.wall += wallMs;
  }
  reboot(newBoot: string): void {
    this.boot = newBoot;
    this.mono = 0;
  }
}

describe("LocalClock", () => {
  it("stamps carry fields and strictly increasing sequence", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    const a = local.stamp();
    clock.tick(1000);
    const b = local.stamp();
    expect(a).toMatchObject({ bootId: "boot-1", seq: 1, provenance: "DEVICE_UNSYNCED" });
    expect(b.seq).toBeGreaterThan(a.seq);
    expect(b.monotonicMs).toBeGreaterThan(a.monotonicMs);
    expect(typeof b.utcMs).toBe("number");
  });

  it("sequence continues strictly increasing after restore from a saved snapshot", () => {
    const clock = new FakeClock();
    const first = LocalClock.fresh(clock);
    first.stamp();
    clock.tick(500);
    const second = first.stamp();
    const saved = JSON.parse(JSON.stringify(first.snapshot())) as unknown;
    clock.tick(500);
    const restored = LocalClock.restore(clock, saved);
    const third = restored.stamp();
    expect(third.seq).toBe(second.seq + 1);
  });

  it("flags a forward wall-clock jump as UNCERTAIN and counts it", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(1000);
    local.stamp();
    clock.jumpWall(60_000);
    clock.tick(1000);
    const reading = local.stamp();
    expect(reading.provenance).toBe("UNCERTAIN");
    expect(local.snapshot().jumps).toBe(1);
  });

  it("flags a backward wall-clock jump as UNCERTAIN", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(1000);
    local.stamp();
    clock.jumpWall(-30_000);
    clock.tick(1000);
    expect(local.stamp().provenance).toBe("UNCERTAIN");
  });

  it("drift within the tolerance is not flagged", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock, { jumpToleranceMs: 1000 });
    clock.tick(1000);
    local.stamp();
    clock.jumpWall(500);
    clock.tick(1000);
    expect(local.stamp().provenance).toBe("DEVICE_UNSYNCED");
    expect(local.snapshot().jumps).toBe(0);
  });

  it("monotonic time going backwards within one boot is flagged, and elapsed never goes negative", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(5000);
    local.stamp();
    clock.mono = 1000;
    const reading = local.stamp();
    expect(reading.provenance).toBe("UNCERTAIN");
    expect(reading.monotonicMs).toBe(1000);
    clock.tick(10);
    const after = local.stamp();
    expect(after.monotonicMs).toBeGreaterThanOrEqual(reading.monotonicMs);
  });

  it("reboot keeps sequence order; a wall rollback across the reboot is flagged", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(1000);
    const before = local.stamp();
    clock.reboot("boot-2");
    clock.wall -= 3_600_000;
    const after = local.stamp();
    expect(after.seq).toBeGreaterThan(before.seq);
    expect(after.bootId).toBe("boot-2");
    expect(after.provenance).toBe("UNCERTAIN");
  });

  it("a reboot with a normal wall clock is not flagged", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(1000);
    local.stamp();
    clock.reboot("boot-2");
    clock.tick(2000);
    expect(local.stamp().provenance).toBe("DEVICE_UNSYNCED");
  });

  it("a trusted sync from the same boot clears uncertainty and sets SYNCED; stale and cross-boot syncs are rejected", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(1000);
    local.stamp();
    clock.jumpWall(60_000);
    clock.tick(1000);
    expect(local.stamp().provenance).toBe("UNCERTAIN");

    const sync = {
      utcMs: clock.wall,
      monotonicMs: clock.mono,
      bootId: "boot-1",
      authenticated: true as const,
    };
    expect(local.applySync(sync)).toEqual({ status: "APPLIED" });
    clock.tick(1000);
    expect(local.stamp().provenance).toBe("SYNCED");

    expect(local.applySync({ ...sync, monotonicMs: sync.monotonicMs - 500 })).toEqual({
      status: "REJECTED",
      reason: "OLDER_THAN_LAST_SYNC",
    });
    expect(local.applySync({ ...sync, bootId: "boot-9", monotonicMs: clock.mono })).toEqual({
      status: "REJECTED",
      reason: "OTHER_BOOT",
    });
    expect(local.applySync({ ...sync, monotonicMs: Number.NaN })).toEqual({
      status: "REJECTED",
      reason: "BAD_VALUE",
    });
  });

  it("a synced clock reports UTC corrected by the sync offset", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    const trueUtc = clock.wall + 5_000;
    expect(
      local.applySync({
        utcMs: trueUtc,
        monotonicMs: clock.mono,
        bootId: "boot-1",
        authenticated: true,
      }),
    ).toEqual({ status: "APPLIED" });
    clock.tick(1000);
    expect(local.stamp().utcMs).toBe(clock.wall + 5_000);
  });

  it("is STALE once the last sync is older than maxSyncAgeMs on monotonic time", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock, { maxSyncAgeMs: 10_000 });
    local.applySync({
      utcMs: clock.wall,
      monotonicMs: clock.mono,
      bootId: "boot-1",
      authenticated: true,
    });
    clock.tick(9_000);
    expect(local.stamp().provenance).toBe("SYNCED");
    clock.tick(2_000);
    expect(local.stamp().provenance).toBe("STALE");
  });

  it("restoring a corrupt or invalid snapshot fails closed with CLOCK_CORRUPT", () => {
    const clock = new FakeClock();
    const valid = LocalClock.fresh(clock).snapshot();
    const bad: unknown[] = [
      null,
      "not-an-object",
      { ...valid, bootId: "" },
      { ...valid, seq: -1 },
      { ...valid, seq: 1.5 },
      { ...valid, lastMonotonicMs: Number.NaN },
      { ...valid, syncBootId: "boot-1", syncMonotonicMs: null },
      { ...valid, uncertain: "yes" },
    ];
    for (const saved of bad) {
      expect(() => LocalClock.restore(clock, saved)).toThrow(ClockError);
      try {
        LocalClock.restore(clock, saved);
      } catch (error: unknown) {
        expect((error as ClockError).code).toBe("CLOCK_CORRUPT");
      }
    }
  });

  it("a suspend (wall advances, monotonic stalls) is treated as a jump", () => {
    const clock = new FakeClock();
    const local = LocalClock.fresh(clock);
    clock.tick(1000);
    local.stamp();
    clock.suspend(3_600_000);
    expect(local.stamp().provenance).toBe("UNCERTAIN");
  });
});
