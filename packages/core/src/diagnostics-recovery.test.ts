import { ALLOWED_LOG_FIELDS, REDACTED } from "./log-redaction.js";
import { DiagnosticsRecovery } from "./diagnostics-recovery.js";

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("DiagnosticsRecovery", () => {
  it("crash kinds are classified; unknown kinds are kept as UNKNOWN", () => {
    const d = DiagnosticsRecovery.fresh();
    expect(d.recordCrash("JS_EXCEPTION", 1_000).category).toBe("SOFTWARE");
    expect(d.recordCrash("NATIVE", 2_000).category).toBe("NATIVE");
    expect(d.recordCrash("OUT_OF_MEMORY", 3_000).category).toBe("RESOURCE");
    expect(d.recordCrash("WATCHDOG", 4_000).category).toBe("HANG");
    expect(d.recordCrash("SOMETHING_NEW", 5_000).category).toBe("UNKNOWN");
    expect(d.snapshot().log.length).toBe(5);
    expect(d.snapshot().log.map((e) => e.errorCode)).toEqual([
      "SOFTWARE",
      "NATIVE",
      "RESOURCE",
      "HANG",
      "UNKNOWN",
    ]);
  });

  it("three crashes inside the window enter safe mode with CRASH_LOOP", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 3, crashWindowMs: 60_000 });
    expect(d.recordCrash("NATIVE", 1_000).mode).toBe("NORMAL");
    expect(d.recordCrash("NATIVE", 2_000).mode).toBe("NORMAL");
    const third = d.recordCrash("NATIVE", 3_000);
    expect(third.mode).toBe("SAFE_MODE");
    expect(d.snapshot()).toMatchObject({ mode: "SAFE_MODE", safeModeReason: "CRASH_LOOP" });
  });

  it("crashes spread outside the window do not trigger safe mode", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 3, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 0);
    d.recordCrash("NATIVE", 100_000);
    const third = d.recordCrash("NATIVE", 200_000);
    expect(third.mode).toBe("NORMAL");
    expect(d.snapshot().crashTimesMs).toEqual([200_000]);
  });

  it("safe mode survives restart", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 2, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 1_000);
    d.recordCrash("NATIVE", 2_000);
    const restored = DiagnosticsRecovery.restore(json(d.snapshot()), {
      crashThreshold: 2,
      crashWindowMs: 60_000,
    });
    expect(restored.mode).toBe("SAFE_MODE");
    expect(restored.snapshot().safeModeReason).toBe("CRASH_LOOP");
  });

  it("leaving safe mode requires exact confirmation; otherwise the mode is unchanged", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 1, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 1_000);
    expect(d.mode).toBe("SAFE_MODE");
    for (const confirmed of [false, undefined, "true", 1, null]) {
      expect(d.exitSafeMode(confirmed, 2_000)).toEqual({
        status: "REFUSED",
        reason: "NOT_CONFIRMED",
      });
    }
    expect(d.mode).toBe("SAFE_MODE");
    expect(d.exitSafeMode(true, 3_000)).toEqual({ status: "EXITED" });
    expect(d.mode).toBe("NORMAL");
    expect(d.exitSafeMode(true, 4_000)).toEqual({
      status: "REFUSED",
      reason: "NOT_IN_SAFE_MODE",
    });
  });

  it("the diagnostic log is bounded: the oldest entries go, the newest are kept", () => {
    const d = DiagnosticsRecovery.fresh({ maxLogEntries: 3 });
    for (let i = 1; i <= 5; i += 1) {
      d.recordEvent("tick", i);
    }
    const log = d.snapshot().log;
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.timestamp)).toEqual([3, 4, 5]);
  });

  it("log entries pass the allowlist and redaction: unknown fields are dropped and secrets replaced", () => {
    const d = DiagnosticsRecovery.fresh();
    d.recordEvent("login", 10, {
      service: "lensmate",
      notAllowedField: "must-not-appear",
      note: "api_key=sk-test-1234567890abcdef",
    });
    const entry = d.snapshot().log[0] ?? {};
    expect(entry).not.toHaveProperty("notAllowedField");
    expect(entry).not.toHaveProperty("note");
    expect(ALLOWED_LOG_FIELDS).toContain("event");
    expect(entry.event).toBe("login");
    expect(REDACTED).toBe("[REDACTED]");
    const serialized = JSON.stringify(d.snapshot());
    expect(serialized).not.toContain("sk-test-1234567890abcdef");
    expect(serialized).not.toContain("must-not-appear");
  });

  it("corrupt saved state enters safe mode with STATE_UNREADABLE and never becomes NORMAL on its own", () => {
    const bad: unknown[] = [
      null,
      "x",
      { mode: "NORMAL", safeModeReason: "CRASH_LOOP", crashTimesMs: [], log: [] },
      { mode: "BROKEN", safeModeReason: null, crashTimesMs: [], log: [] },
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: ["x"], log: [] },
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: [], log: [1] },
    ];
    for (const saved of bad) {
      const d = DiagnosticsRecovery.restore(saved);
      expect(d.snapshot()).toEqual({
        mode: "SAFE_MODE",
        safeModeReason: "STATE_UNREADABLE",
        crashTimesMs: [],
        log: [],
      });
      expect(d.mode).toBe("SAFE_MODE");
    }
  });

  it("round trip restores an equal, bounded snapshot", () => {
    const options = { crashThreshold: 5, crashWindowMs: 60_000, maxLogEntries: 4 };
    const d = DiagnosticsRecovery.fresh(options);
    for (let i = 0; i < 6; i += 1) d.recordEvent("tick", i);
    d.recordCrash("NATIVE", 1_000_000);
    const saved = json(d.snapshot());
    const restored = DiagnosticsRecovery.restore(saved, options);
    expect(restored.snapshot()).toEqual(d.snapshot());
    expect(restored.snapshot().log.length).toBeLessThanOrEqual(4);
  });

  it("snapshot is a deep copy; changing it does not change the controller", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 9 });
    d.recordCrash("NATIVE", 1_000);
    const copy = d.snapshot() as unknown as {
      crashTimesMs: number[];
      log: Record<string, unknown>[];
      mode: string;
    };
    copy.crashTimesMs.length = 0;
    copy.log.length = 0;
    copy.mode = "SAFE_MODE";
    const fresh = d.snapshot();
    expect(fresh.crashTimesMs).toEqual([1_000]);
    expect(fresh.log).toHaveLength(1);
    expect(fresh.mode).toBe("NORMAL");
  });
});
