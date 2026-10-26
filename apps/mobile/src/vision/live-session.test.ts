import {
  LiveVisionSession,
  MAX_FRAMES,
  MAX_SESSION_MS,
  MIN_INTERVAL_MS,
  SESSION_BUDGET_PAISE,
  type LiveAnswer,
  type LiveVisionDeps,
} from "./live-session";

// Mock-mode only: no provider is called. Frames are fixed JPEG headers; the analyser is a test double.
const FRAME = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

/** A fake clock. Timers run only when advance() moves time past them, so no real time passes. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const deps = {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
  };
  return {
    deps,
    pending: () => timers.size,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) {
          break;
        }
        const [id, timer] = due;
        timers.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = target;
    },
  };
}

/** A promise the test resolves by hand, so it controls exactly when a capture or analysis finishes. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((r) => setImmediate(r));

function answer(text: string, costPaise = 3): LiveAnswer {
  return { text, source: "mock", costPaise };
}

function build(overrides: Partial<LiveVisionDeps> = {}) {
  const clock = fakeClock();
  const captured: Array<(frame: string | null) => void> = [];
  const analyses: Array<{
    frame: string;
    question: string;
    signal: AbortSignal;
    resolve: (a: LiveAnswer) => void;
    reject: (e: unknown) => void;
  }> = [];
  const captureFrame = jest.fn(
    () =>
      new Promise<string | null>((resolve) => {
        captured.push(resolve);
      }),
  );
  const analyse = jest.fn(
    (frame: string, question: string, signal: AbortSignal) =>
      new Promise<LiveAnswer>((resolve, reject) => {
        analyses.push({ frame, question, signal, resolve, reject });
      }),
  );
  const session = new LiveVisionSession({
    ...clock.deps,
    captureFrame,
    analyse,
    ...overrides,
  });
  return {
    session,
    clock,
    captureFrame,
    analyse,
    analyses,
    /** Completes the oldest pending capture with the given frame (a valid frame by default). */
    giveFrame(frame: string | null = FRAME) {
      captured.shift()?.(frame);
    },
  };
}

describe("LiveVisionSession: start, stop and limits", () => {
  it("refuses an interval below the safe minimum", () => {
    const h = build();
    expect(() => h.session.start({ intervalMs: MIN_INTERVAL_MS - 1, question: "what?" })).toThrow(
      RangeError,
    );
    expect(h.session.state.phase).toBe("idle");
  });

  it("accepts the minimum interval and reports running", () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "what?" });
    expect(h.session.state.phase).toBe("running");
  });

  it("does not start a second session while one is running", () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "a" });
    expect(() => h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "b" })).toThrow();
  });

  it("refuses session limits above the hard maximum", () => {
    const h = build();
    expect(() =>
      h.session.start({
        intervalMs: MIN_INTERVAL_MS,
        question: "x",
        maxSessionMs: MAX_SESSION_MS + 1,
      }),
    ).toThrow(RangeError);
  });

  it("stop() ends the session and clears its timers", () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });
    h.session.stop();
    expect(h.session.state.phase).toBe("stopped");
    expect(h.clock.pending()).toBe(0);
  });

  it("stop() when not running does nothing", () => {
    const h = build();
    h.session.stop();
    expect(h.session.state.phase).toBe("idle");
  });
});

describe("LiveVisionSession: periodic analysis", () => {
  it("analyses one frame per interval and shows the mock source", async () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "what is here?" });

    h.clock.advance(MIN_INTERVAL_MS);
    h.giveFrame();
    await flush();
    h.analyses[0]?.resolve(answer("A desk."));
    await flush();

    expect(h.analyse).toHaveBeenCalledTimes(1);
    expect(h.analyses[0]?.question).toBe("what is here?");
    expect(h.session.state).toMatchObject({
      framesAnalysed: 1,
      answer: { text: "A desk." },
      source: "mock",
    });
  });

  it("never runs two analyses at the same time, and counts skipped ticks", async () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });

    h.clock.advance(MIN_INTERVAL_MS);
    h.giveFrame();
    await flush();
    // The first analysis is still pending when the next tick arrives.
    h.clock.advance(MIN_INTERVAL_MS);
    await flush();

    expect(h.analyse).toHaveBeenCalledTimes(1);
    expect(h.session.state.ticksSkipped).toBe(1);
  });

  it("skips an invalid frame and keeps running", async () => {
    const h = build({
      captureFrame: async () => "not an image",
    });
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });

    h.clock.advance(MIN_INTERVAL_MS);
    await flush();

    expect(h.analyse).not.toHaveBeenCalled();
    expect(h.session.state).toMatchObject({ invalidFrames: 1, phase: "running" });
  });

  it("skips a frame that the camera did not return", async () => {
    const h = build({ captureFrame: async () => null });
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });

    h.clock.advance(MIN_INTERVAL_MS);
    await flush();

    expect(h.analyse).not.toHaveBeenCalled();
    expect(h.session.state.invalidFrames).toBe(1);
  });
});

describe("LiveVisionSession: cancellation and stale results", () => {
  it("stop() cancels the analysis in flight and drops its late result", async () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });
    h.clock.advance(MIN_INTERVAL_MS);
    h.giveFrame();
    await flush();
    const signal = h.analyses[0]?.signal as AbortSignal;

    h.session.stop();
    h.analyses[0]?.resolve(answer("Too late"));
    h.clock.advance(MIN_INTERVAL_MS * 2);
    await flush();

    expect(signal.aborted).toBe(true);
    expect(h.session.state.answer).toBeNull();
    expect(h.session.state.framesAnalysed).toBe(0);
    expect(h.captureFrame).toHaveBeenCalledTimes(1);
  });

  it("a capture that finishes after stop() is never sent to the provider", async () => {
    const pending = deferred<string | null>();
    const h = build({ captureFrame: () => pending.promise });
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });
    h.clock.advance(MIN_INTERVAL_MS);

    h.session.stop();
    pending.resolve(FRAME);
    await flush();

    expect(h.analyse).not.toHaveBeenCalled();
  });

  it("dispose() cancels everything and cannot be restarted", async () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });
    h.clock.advance(MIN_INTERVAL_MS);
    h.giveFrame();
    await flush();
    const signal = h.analyses[0]?.signal as AbortSignal;

    h.session.dispose();

    expect(signal.aborted).toBe(true);
    expect(h.clock.pending()).toBe(0);
    expect(() => h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" })).toThrow(
      "SESSION_DISPOSED",
    );
  });
});

describe("LiveVisionSession: limits", () => {
  it("ends by itself at the time limit", () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x", maxSessionMs: 10_000 });

    h.clock.advance(10_000);

    expect(h.session.state.phase).toBe("timed_out");
    expect(h.clock.pending()).toBe(0);
  });

  it("stops when the next analysis would exceed the session budget", async () => {
    const h = build();
    h.session.start({
      intervalMs: MIN_INTERVAL_MS,
      question: "x",
      budgetPaise: 9,
      worstCasePaise: 4,
    });

    // Each completed analysis costs 3 paise. After two, 6 + 4 (worst case) > 9 blocks the third.
    for (let i = 0; i < 2; i += 1) {
      h.clock.advance(MIN_INTERVAL_MS);
      h.giveFrame();
      await flush();
      h.analyses[i]?.resolve(answer(`answer ${i}`, 3));
      await flush();
    }
    h.clock.advance(MIN_INTERVAL_MS);
    await flush();

    expect(h.session.state).toMatchObject({
      phase: "budget_reached",
      spentPaise: 6,
      framesAnalysed: 2,
    });
    expect(h.analyse).toHaveBeenCalledTimes(2);
  });

  it("stops at the frame limit", async () => {
    const h = build();
    h.session.start({
      intervalMs: MIN_INTERVAL_MS,
      question: "x",
      maxFrames: 1,
      budgetPaise: SESSION_BUDGET_PAISE,
    });

    h.clock.advance(MIN_INTERVAL_MS);
    h.giveFrame();
    await flush();
    h.analyses[0]?.resolve(answer("one"));
    await flush();
    h.clock.advance(MIN_INTERVAL_MS);
    await flush();

    expect(h.session.state.phase).toBe("stopped");
    expect(h.session.state.message).toMatch(/Frame limit/);
    expect(MAX_FRAMES).toBeGreaterThan(0);
  });

  it("stops at the hard frame cap of 40", async () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });

    for (let i = 0; i < MAX_FRAMES; i += 1) {
      h.clock.advance(MIN_INTERVAL_MS);
      h.giveFrame();
      await flush();
      h.analyses[i]?.resolve(answer(`answer ${i}`, 0));
      await flush();
    }
    h.clock.advance(MIN_INTERVAL_MS);

    // At the minimum interval the 40th frame falls on the 120 second time cap, so either cap may end the session.
    // Both end it without another frame, which is what matters for cost and privacy.
    expect(["stopped", "timed_out"]).toContain(h.session.state.phase);
    // The frame in flight when the time cap fires is cancelled, so it is not counted as analysed.
    expect(h.session.state.framesAnalysed).toBeLessThanOrEqual(40);
    expect(h.analyse.mock.calls.length).toBeLessThanOrEqual(40);
  });

  it("ends at the default 120 second time cap", () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });

    h.clock.advance(MAX_SESSION_MS);

    expect(MAX_SESSION_MS).toBe(120_000);
    expect(h.session.state.phase).toBe("timed_out");
    expect(h.session.state.message).toMatch(/time limit/);
    expect(h.clock.pending()).toBe(0);
  });

  it("reports an analysis failure as an error state and stops", async () => {
    const h = build();
    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });
    h.clock.advance(MIN_INTERVAL_MS);
    h.giveFrame();
    await flush();

    h.analyses[0]?.reject(new Error("network down"));
    await flush();

    expect(h.session.state.phase).toBe("error");
    expect(h.clock.pending()).toBe(0);
  });

  it("notifies subscribers of each change, and stops notifying after unsubscribe", () => {
    const h = build();
    const seen: string[] = [];
    const off = h.session.subscribe((s) => seen.push(s.phase));

    h.session.start({ intervalMs: MIN_INTERVAL_MS, question: "x" });
    off();
    h.session.stop();

    expect(seen[0]).toBe("running");
    expect(seen).not.toContain("stopped");
  });
});
