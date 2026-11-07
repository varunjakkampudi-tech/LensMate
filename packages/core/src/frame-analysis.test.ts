import { FrameAnalysisError, FrameAnalysisSession } from "./frame-analysis.js";
import type { FrameAnalysisOptions, FramePlatformCheck, FrameProvider } from "./frame-analysis.js";
import { ProviderGateway } from "./provider-gateway.js";
import { SpendCap } from "./spend-cap.js";

const FEATURE = "LIVE_FRAME_ANALYSIS";
const FRAME = new Uint8Array([1, 2, 3, 4]);
const yes: FramePlatformCheck = () => Promise.resolve(true);
const ok: FrameProvider = () => Promise.resolve({ value: "SYNTHETIC-LABEL", costMinor: 10 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets pending promise continuations run. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function gateway(
  cap = new SpendCap(500),
  maxAttempts: 1 | 2 = 1,
  disclose = true,
): ProviderGateway {
  const g = new ProviderGateway(cap, {
    timeoutMs: 50,
    maxAttempts,
    circuitFailureThreshold: 10,
    circuitCooldownMs: 1000,
    now: () => 0,
  });
  if (disclose) g.acceptDisclosure(FEATURE);
  return g;
}

function session(
  overrides: Partial<FrameAnalysisOptions> & { calls?: { provider: number; auth: number } } = {},
) {
  const calls = overrides.calls ?? { provider: 0, auth: 0 };
  const rest: Partial<FrameAnalysisOptions> & {
    calls?: unknown;
    provider?: FrameProvider;
    authorize?: FramePlatformCheck;
  } = { ...overrides };
  delete rest.calls;
  const custom = rest.provider ?? ok;
  const customAuthorize = rest.authorize ?? yes;
  const provider: FrameProvider = (frame, signal) => {
    calls.provider += 1;
    return custom(frame, signal);
  };
  const authorize: FramePlatformCheck = () => {
    calls.auth += 1;
    return customAuthorize();
  };
  const options: FrameAnalysisOptions = {
    gateway: gateway(),
    feature: FEATURE,
    estimatedCostMinor: 10,
    maxFrameBytes: 1024,
    minIntervalMs: 0,
    maxAnalyses: 10,
    ...rest,
    authorize,
    provider,
  };
  return { session: new FrameAnalysisSession(options), calls };
}

describe("live frame analysis (C02)", () => {
  it("C02: frames need exact-true authorization before any provider call", async () => {
    for (const authorize of [
      () => Promise.resolve(false),
      () => Promise.resolve("yes"),
      () => Promise.resolve(undefined),
      () => Promise.reject(new Error("auth service down")),
    ]) {
      const { session: s, calls } = session({ authorize });
      expect(await s.analyze(FRAME, 0)).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
      expect(calls.provider).toBe(0);
    }
    const granted = session();
    expect(await granted.session.analyze(FRAME, 0)).toEqual({
      status: "OK",
      value: "SYNTHETIC-LABEL",
      analyzedAtMs: 0,
    });
  });

  it("C02: provider calls go through the gateway; disclosure and spend limits apply", async () => {
    const undisclosed = session({ gateway: gateway(new SpendCap(500), 1, false) });
    expect(await undisclosed.session.analyze(FRAME, 0)).toEqual({
      status: "REFUSED",
      reason: "DISCLOSURE_REQUIRED",
    });
    expect(undisclosed.calls.provider).toBe(0);

    const capped = session({ gateway: gateway(new SpendCap(5)), estimatedCostMinor: 10 });
    const refused = await capped.session.analyze(FRAME, 0);
    expect(refused.status).toBe("REFUSED");
    expect(capped.calls.provider).toBe(0);
  });

  it("C02: frames closer than the sampling interval are refused", async () => {
    const { session: s, calls } = session({ minIntervalMs: 100 });
    expect((await s.analyze(FRAME, 0)).status).toBe("OK");
    expect(await s.analyze(FRAME, 50)).toEqual({ status: "REFUSED", reason: "SAMPLED_OUT" });
    expect(calls.provider).toBe(1);
    expect((await s.analyze(FRAME, 100)).status).toBe("OK");
    expect(calls.provider).toBe(2);
  });

  it("C02: concurrent analysis in one session is refused", async () => {
    const pending = deferred<FrameProviderResultLike>();
    const { session: s, calls } = session({ provider: () => pending.promise });
    const first = s.analyze(FRAME, 0);
    await flush();
    expect(s.busy).toBe(true);
    expect(await s.analyze(FRAME, 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    pending.resolve({ value: "done", costMinor: 10 });
    expect((await first).status).toBe("OK");
    // Only the first request reached the provider; the refused second request made no call.
    expect(calls.provider).toBe(1);
  });

  it("C02: session analysis limit is enforced", async () => {
    const { session: s, calls } = session({ maxAnalyses: 2 });
    expect((await s.analyze(FRAME, 0)).status).toBe("OK");
    expect((await s.analyze(FRAME, 1)).status).toBe("OK");
    expect(await s.analyze(FRAME, 2)).toEqual({ status: "REFUSED", reason: "LIMIT_REACHED" });
    expect(calls.provider).toBe(2);
  });

  it("C02: oversize frames are refused before any call", async () => {
    const { session: s, calls } = session({ maxFrameBytes: 8 });
    expect(await s.analyze(new Uint8Array(9), 0)).toEqual({
      status: "REFUSED",
      reason: "OVERSIZE",
    });
    expect(calls.auth).toBe(0);
    expect(calls.provider).toBe(0);
  });

  it("C02: cancel discards an in-flight result and refuses later frames", async () => {
    const pending = deferred<FrameProviderResultLike>();
    let seenSignal: AbortSignal | null = null;
    const { session: s } = session({
      provider: (_frame, signal) => {
        seenSignal = signal;
        return pending.promise;
      },
    });
    const running = s.analyze(FRAME, 0);
    await flush();
    s.cancel();
    expect((seenSignal as AbortSignal | null)?.aborted).toBe(true);
    pending.resolve({ value: "late", costMinor: 10 });
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(await s.analyze(FRAME, 1)).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C02: cancel during authorization stops before the provider", async () => {
    const auth = deferred<unknown>();
    const { session: s, calls } = session({ authorize: () => auth.promise });
    const running = s.analyze(FRAME, 0);
    await flush();
    s.cancel();
    auth.resolve(true);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(calls.provider).toBe(0);
  });

  it("C02: provider failures are reported and the session stays usable", async () => {
    let fail = true;
    const { session: s } = session({
      provider: () =>
        fail
          ? Promise.reject(new Error("provider fault"))
          : ok(FRAME, new AbortController().signal),
    });
    expect(await s.analyze(FRAME, 0)).toEqual({ status: "REFUSED", reason: "PROVIDER_ERROR" });
    fail = false;
    expect((await s.analyze(FRAME, 1)).status).toBe("OK");
  });

  it("C02: invalid input is refused before any call", async () => {
    const { session: s, calls } = session();
    expect(await s.analyze(new Uint8Array(0), 0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    expect(await s.analyze("frame" as unknown as Uint8Array, 0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(await s.analyze(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(calls.auth).toBe(0);
    expect(calls.provider).toBe(0);
  });

  it("C02: invalid configuration is refused", () => {
    const base: FrameAnalysisOptions = {
      gateway: gateway(),
      feature: FEATURE,
      estimatedCostMinor: 10,
      authorize: yes,
      provider: ok,
      maxFrameBytes: 1024,
      minIntervalMs: 0,
      maxAnalyses: 10,
    };
    const bad: Partial<FrameAnalysisOptions>[] = [
      { estimatedCostMinor: -1 },
      { estimatedCostMinor: 1.5 },
      { maxFrameBytes: 0 },
      { maxFrameBytes: 16 * 1024 * 1024 + 1 },
      { minIntervalMs: -1 },
      { maxAnalyses: 0 },
      { maxAnalyses: 1001 },
    ];
    for (const override of bad) {
      expect(() => new FrameAnalysisSession({ ...base, ...override })).toThrow(FrameAnalysisError);
    }
  });

  it("C02: no frame is retained after analysis", async () => {
    const { session: s } = session();
    expect((await s.analyze(FRAME, 0)).status).toBe("OK");
    for (const value of Object.values(s)) {
      expect(value).not.toBe(FRAME);
      expect(value instanceof Uint8Array).toBe(false);
    }
  });
});

type FrameProviderResultLike = { value: string; costMinor: number };
