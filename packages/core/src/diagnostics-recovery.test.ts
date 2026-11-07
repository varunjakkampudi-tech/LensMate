import { ALLOWED_LOG_FIELDS, REDACTED } from "./log-redaction.js";
import { DiagnosticsError, DiagnosticsRecovery } from "./diagnostics-recovery.js";

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

const passVerify = () => Promise.resolve(true);

describe("DiagnosticsRecovery", () => {
  it("crash kinds are classified; unknown kinds are kept as UNKNOWN", () => {
    const d = DiagnosticsRecovery.fresh();
    expect(d.recordCrash("JS_EXCEPTION", 1_000).category).toBe("SOFTWARE");
    expect(d.recordCrash("NATIVE", 2_000).category).toBe("NATIVE");
    expect(d.recordCrash("OUT_OF_MEMORY", 3_000).category).toBe("RESOURCE");
    expect(d.recordCrash("WATCHDOG", 4_000).category).toBe("HANG");
    expect(d.recordCrash("SOMETHING_NEW", 5_000).category).toBe("UNKNOWN");
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
    expect(d.recordCrash("NATIVE", 3_000).mode).toBe("SAFE_MODE");
    expect(d.snapshot()).toMatchObject({ mode: "SAFE_MODE", safeModeReason: "CRASH_LOOP" });
  });

  it("crashes spread outside the window do not trigger safe mode", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 3, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 0);
    d.recordCrash("NATIVE", 100_000);
    expect(d.recordCrash("NATIVE", 200_000).mode).toBe("NORMAL");
    expect(d.snapshot().crashTimesMs).toEqual([200_000]);
  });

  it("safe mode survives restart", () => {
    const options = { crashThreshold: 2, crashWindowMs: 60_000 };
    const d = DiagnosticsRecovery.fresh(options);
    d.recordCrash("NATIVE", 1_000);
    d.recordCrash("NATIVE", 2_000);
    const restored = DiagnosticsRecovery.restore(json(d.snapshot()), options);
    expect(restored.mode).toBe("SAFE_MODE");
    expect(restored.snapshot().safeModeReason).toBe("CRASH_LOOP");
  });

  it("CR-27: leaving safe mode requires exact confirmation and a successful verifier", async () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 1, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 1_000);
    expect(d.mode).toBe("SAFE_MODE");
    for (const confirmed of [false, undefined, "true", 1, null]) {
      expect(await d.exitSafeMode(confirmed, 2_000, passVerify)).toEqual({
        status: "REFUSED",
        reason: "NOT_CONFIRMED",
      });
    }
    expect(d.mode).toBe("SAFE_MODE");
    expect(await d.exitSafeMode(true, 3_000, passVerify)).toEqual({ status: "EXITED" });
    expect(d.mode).toBe("NORMAL");
    expect(await d.exitSafeMode(true, 4_000, passVerify)).toEqual({
      status: "REFUSED",
      reason: "NOT_IN_SAFE_MODE",
    });
  });

  it("CR-27: missing, failed, malformed, throwing and truthy-but-not-true verification keep safe mode", async () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 1, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 1_000);
    const verifiers: Array<() => Promise<unknown>> = [
      () => Promise.resolve(false),
      () => Promise.resolve("yes"),
      () => Promise.resolve(1),
      () => Promise.resolve(undefined),
      () => Promise.reject(new Error("probe failed")),
    ];
    for (const verify of verifiers) {
      expect(await d.exitSafeMode(true, 2_000, verify)).toEqual({
        status: "REFUSED",
        reason: "NOT_VERIFIED",
      });
      expect(d.mode).toBe("SAFE_MODE");
    }
    expect(await d.exitSafeMode(true, 3_000, passVerify)).toEqual({ status: "EXITED" });
  });

  it("CR-28: the diagnostic log is bounded; the oldest entries go and the newest are kept", () => {
    const d = DiagnosticsRecovery.fresh({ maxLogEntries: 3 });
    for (let i = 1; i <= 5; i += 1) {
      d.recordEvent("tick", i);
    }
    expect(d.snapshot().log.map((e) => e.timestamp)).toEqual([3, 4, 5]);
  });

  it("log entries pass the allowlist and redaction: unknown fields are dropped and secrets replaced", () => {
    const d = DiagnosticsRecovery.fresh();
    d.recordEvent("login", 10, {
      service: "lensmate",
      notAllowedField: "must-not-appear",
      note: ["api", "_key=sk-", "test-1234567890abcdef"].join(""),
    });
    const entry = d.snapshot().log[0] ?? {};
    expect(entry).not.toHaveProperty("notAllowedField");
    expect(entry).not.toHaveProperty("note");
    expect(ALLOWED_LOG_FIELDS).toContain("event");
    expect(entry.event).toBe("login");
    expect(REDACTED).toBe("[REDACTED]");
    const serialized = JSON.stringify(d.snapshot());
    expect(serialized).not.toContain(["sk-", "test-1234567890abcdef"].join(""));
    expect(serialized).not.toContain("must-not-appear");
  });

  it("CR-28: restored log entries are sanitized again; raw secrets and unknown fields never reach snapshot()", () => {
    const secret = ["sk-", "live-9876543210zyxwvu"].join("");
    const malicious = {
      mode: "NORMAL",
      safeModeReason: null,
      crashTimesMs: [],
      latestMs: 5,
      log: [
        { event: "login", timestamp: 1, errorCode: secret, injected: "raw-payload" },
        { event: "other", timestamp: 2, service: "x", password: "hunter2" },
      ],
    };
    const d = DiagnosticsRecovery.restore(malicious);
    const serialized = JSON.stringify(d.snapshot());
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("raw-payload");
    expect(serialized).not.toContain("hunter2");
    expect(d.snapshot().log[0]).not.toHaveProperty("injected");
  });

  it("CR-28: malformed persisted log entries make the state unreadable; oversized logs keep only the newest", () => {
    const badEntries: unknown[] = [null, "text", 5, ["array"]];
    for (const entry of badEntries) {
      const d = DiagnosticsRecovery.restore({
        mode: "NORMAL",
        safeModeReason: null,
        crashTimesMs: [],
        latestMs: 0,
        log: [entry],
      });
      expect(d.mode).toBe("SAFE_MODE");
      expect(d.snapshot().safeModeReason).toBe("STATE_UNREADABLE");
    }
    const big = Array.from({ length: 50 }, (_, i) => ({ event: "tick", timestamp: i }));
    const oversized = DiagnosticsRecovery.restore(
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: [], latestMs: 49, log: big },
      { maxLogEntries: 5 },
    );
    expect(oversized.mode).toBe("NORMAL");
    expect(oversized.snapshot().log.map((e) => e.timestamp)).toEqual([45, 46, 47, 48, 49]);
  });

  it("CR-29: invalid timestamps fall back to the latest valid time and still count toward a loop", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 3, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 10_000);
    d.recordCrash("NATIVE", Number.NaN);
    const third = d.recordCrash("NATIVE", -5);
    expect(third.mode).toBe("SAFE_MODE");
    expect(d.snapshot().crashTimesMs).toEqual([10_000, 10_000, 10_000]);
    expect(Number.isFinite(d.snapshot().latestMs)).toBe(true);
  });

  it("CR-29: out-of-order crash timestamps cannot evade the crash-loop count", () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 3, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 500_000);
    d.recordCrash("NATIVE", 100);
    expect(d.recordCrash("NATIVE", 200).mode).toBe("SAFE_MODE");
  });

  it("CR-29: invalid configuration is refused with INVALID_CONFIG", () => {
    const bad: Array<Parameters<typeof DiagnosticsRecovery.fresh>[0]> = [
      { crashThreshold: 0 },
      { crashThreshold: 1.5 },
      { crashThreshold: 101 },
      { crashWindowMs: 0 },
      { crashWindowMs: -1 },
      { crashWindowMs: Number.POSITIVE_INFINITY },
      { maxLogEntries: 0 },
      { maxLogEntries: 20_000 },
    ];
    for (const options of bad) {
      expect(() => DiagnosticsRecovery.fresh(options)).toThrow(DiagnosticsError);
    }
  });

  it("corrupt saved state enters safe mode with STATE_UNREADABLE and never becomes NORMAL on its own", () => {
    const bad: unknown[] = [
      null,
      "x",
      { mode: "NORMAL", safeModeReason: "CRASH_LOOP", crashTimesMs: [], latestMs: 0, log: [] },
      { mode: "BROKEN", safeModeReason: null, crashTimesMs: [], latestMs: 0, log: [] },
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: ["x"], latestMs: 0, log: [] },
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: [], latestMs: -1, log: [] },
      { mode: "NORMAL", safeModeReason: null, crashTimesMs: [], latestMs: 0, log: [1] },
    ];
    for (const saved of bad) {
      const d = DiagnosticsRecovery.restore(saved);
      expect(d.snapshot()).toEqual({
        mode: "SAFE_MODE",
        safeModeReason: "STATE_UNREADABLE",
        crashTimesMs: [],
        latestMs: 0,
        log: [],
      });
    }
  });

  it("round trip restores an equal, bounded snapshot", () => {
    const options = { crashThreshold: 5, crashWindowMs: 60_000, maxLogEntries: 4 };
    const d = DiagnosticsRecovery.fresh(options);
    for (let i = 0; i < 6; i += 1) d.recordEvent("tick", i);
    d.recordCrash("NATIVE", 1_000_000);
    const restored = DiagnosticsRecovery.restore(json(d.snapshot()), options);
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
  it("CR-30: the largest accepted threshold is reachable, and more than 100 crashes in one window still trigger safe mode", () => {
    const max = 64;
    const d = DiagnosticsRecovery.fresh({ crashThreshold: max, crashWindowMs: 1_000_000 });
    let last = { mode: "NORMAL" as string };
    for (let i = 0; i < 100; i += 1) {
      last = d.recordCrash("NATIVE", 1_000 + i);
      if (i + 1 < max) expect(last.mode).toBe("NORMAL");
    }
    expect(last.mode).toBe("SAFE_MODE");
    expect(d.snapshot().crashTimesMs.length).toBeLessThanOrEqual(64);
  });

  it("CR-30: thresholds above the retained history are refused with INVALID_CONFIG", () => {
    expect(() => DiagnosticsRecovery.fresh({ crashThreshold: 65 })).toThrow(DiagnosticsError);
    expect(() => DiagnosticsRecovery.fresh({ crashThreshold: 64 })).not.toThrow();
  });

  it("CR-31: a crash during pending verification prevents the stale verification from clearing safe mode", async () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 1, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 1_000);
    let resolveVerify: (value: unknown) => void = () => undefined;
    const pending = new Promise<unknown>((resolve) => {
      resolveVerify = resolve;
    });
    const exit = d.exitSafeMode(true, 2_000, () => pending);
    d.recordCrash("NATIVE", 3_000);
    const eventsBefore = d.snapshot().log.length;
    resolveVerify(true);
    expect(await exit).toEqual({ status: "REFUSED", reason: "STALE_VERIFICATION" });
    expect(d.mode).toBe("SAFE_MODE");
    expect(d.snapshot().crashTimesMs).toEqual([1_000, 3_000]);
    expect(d.snapshot().log.length).toBe(eventsBefore);
    expect(d.snapshot().log.some((e) => e.event === "safe_mode_exited")).toBe(false);
    expect(await d.exitSafeMode(true, 4_000, passVerify)).toEqual({ status: "EXITED" });
  });

  it("CR-31: a fresh verification after a crash can recover successfully", async () => {
    const d = DiagnosticsRecovery.fresh({ crashThreshold: 1, crashWindowMs: 60_000 });
    d.recordCrash("NATIVE", 1_000);
    d.recordCrash("NATIVE", 2_000);
    expect(await d.exitSafeMode(true, 3_000, passVerify)).toEqual({ status: "EXITED" });
    expect(d.mode).toBe("NORMAL");
  });
});
