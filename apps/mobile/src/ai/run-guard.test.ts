import { RunGuard } from "./run-guard";

describe("RunGuard", () => {
  it("treats a run as current until it finishes or is cancelled", () => {
    const guard = new RunGuard();
    const run = guard.begin();
    expect(guard.isCurrent(run.id)).toBe(true);
    guard.finish(run.id);
    expect(guard.isCurrent(run.id)).toBe(false);
  });

  it("cancels the previous run when a new one starts, and aborts its signal", () => {
    const guard = new RunGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(first.signal.aborted).toBe(true);
    expect(guard.isCurrent(first.id)).toBe(false);
    expect(guard.isCurrent(second.id)).toBe(true);
  });

  it("ignores a result from a cancelled run, even after a new run starts", () => {
    const guard = new RunGuard();
    const stale = guard.begin();
    guard.cancel();
    const fresh = guard.begin();

    expect(guard.isCurrent(stale.id)).toBe(false);
    expect(guard.isCurrent(fresh.id)).toBe(true);
  });

  it("reports whether there was anything to cancel", () => {
    const guard = new RunGuard();
    expect(guard.cancel()).toBe(false);
    guard.begin();
    expect(guard.cancel()).toBe(true);
    expect(guard.cancel()).toBe(false);
  });

  it("handles many overlapping runs: only the last one is ever current", () => {
    const guard = new RunGuard();
    const runs = Array.from({ length: 25 }, () => guard.begin());
    const current = runs.filter((r) => guard.isCurrent(r.id));
    expect(current.map((r) => r.id)).toEqual([runs[runs.length - 1]?.id]);
    expect(runs.slice(0, -1).every((r) => r.signal.aborted)).toBe(true);
  });

  it("reports the latest run as latest after it finishes, and no longer once a newer run starts or it is cancelled", () => {
    const guard = new RunGuard();
    const run = guard.begin();
    guard.finish(run.id);
    expect(guard.isLatest(run.id)).toBe(true);
    const next = guard.begin();
    expect(guard.isLatest(run.id)).toBe(false);
    expect(guard.isLatest(next.id)).toBe(true);
    guard.cancel();
    expect(guard.isLatest(next.id)).toBe(false);
  });
});
