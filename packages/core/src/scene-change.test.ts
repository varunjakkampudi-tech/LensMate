import {
  SceneChangeDetector,
  SceneChangeError,
  compareLabels,
  parseLabels,
} from "./scene-change.js";
import type { SceneChangeAnalysis } from "./scene-change.js";

const FRAME = new Uint8Array([7, 7, 7]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets pending promise continuations run. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

type AnalysisResult = Awaited<ReturnType<SceneChangeAnalysis["analyze"]>>;

function okValue(value: unknown): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: 0 } as unknown as AnalysisResult;
}

const KITCHEN = JSON.stringify([
  { label: "table", confidence: 0.9 },
  { label: "mug", confidence: 0.8 },
]);
const OFFICE = JSON.stringify([
  { label: "desk", confidence: 0.9 },
  { label: "monitor", confidence: 0.85 },
]);

function factory(script: () => Promise<unknown> = () => Promise.resolve(okValue(KITCHEN))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): SceneChangeAnalysis => {
    const record = { analyze: 0, cancel: 0 };
    created.push(record);
    return {
      analyze: () => {
        record.analyze += 1;
        return script() as Promise<AnalysisResult>;
      },
      cancel: () => {
        record.cancel += 1;
      },
    };
  };
  return { createAnalysis, created };
}

describe("visual scene changes (C10)", () => {
  it("C10: a refusal passes through and leaves the previous summary unchanged", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    expect(await d.detect(FRAME, 1)).toEqual({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" });
    expect(d.analysing).toBe(false);
  });

  it("C10: malformed scene summaries are refused", () => {
    const bad = [
      JSON.stringify({ label: "x", confidence: 0.9 }),
      JSON.stringify(Array.from({ length: 21 }, () => ({ label: "x", confidence: 0.9 }))),
      JSON.stringify([{ label: "", confidence: 0.9 }]),
      JSON.stringify([{ label: "x".repeat(81), confidence: 0.9 }]),
      JSON.stringify([{ label: "bad\u0007", confidence: 0.9 }]),
      JSON.stringify([{ label: "x", confidence: 1.5 }]),
      "not json",
    ];
    for (const raw of bad) expect(parseLabels(raw)).toBeNull();
  });

  it("C10: out-of-order frames are refused and not stored; invalid timestamps are refused before any call", async () => {
    const f = factory();
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    expect((await d.detect(FRAME, 10)).status).toBe("OK");
    expect(await d.detect(FRAME, 10)).toEqual({ status: "REFUSED", reason: "OUT_OF_ORDER" });
    expect(await d.detect(FRAME, 5)).toEqual({ status: "REFUSED", reason: "OUT_OF_ORDER" });
    expect(f.created).toHaveLength(1);

    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await d.detect(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(await d.detect(new Uint8Array(0), 20)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    expect(f.created).toHaveLength(1);
  });

  it("C10: unchanged, changed, ambiguous, baseline and insufficient outcomes are classified", async () => {
    const kitchen = [
      { label: "table", confidence: 0.9, certainty: "HIGH" as const },
      { label: "mug", confidence: 0.8, certainty: "HIGH" as const },
    ];
    expect(compareLabels(kitchen, kitchen).state).toBe("UNCHANGED");
    const office = [
      { label: "desk", confidence: 0.9, certainty: "HIGH" as const },
      { label: "monitor", confidence: 0.85, certainty: "HIGH" as const },
    ];
    expect(compareLabels(kitchen, office).state).toBe("CHANGED");
    const partial = [
      { label: "table", confidence: 0.9, certainty: "HIGH" as const },
      { label: "lamp", confidence: 0.8, certainty: "HIGH" as const },
    ];
    expect(compareLabels(kitchen, partial).state).toBe("AMBIGUOUS");
    expect(compareLabels(kitchen, []).state).toBe("INSUFFICIENT");

    const f = factory();
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    expect(await d.detect(FRAME, 1)).toMatchObject({ status: "OK", change: { state: "BASELINE" } });
  });

  it("C10: low-confidence labels never make a change certain", () => {
    const kitchen = [{ label: "table", confidence: 0.9, certainty: "HIGH" as const }];
    const blurry = [{ label: "blur", confidence: 0.2, certainty: "LOW" as const }];
    expect(compareLabels(kitchen, blurry).state).toBe("AMBIGUOUS");
  });

  it("C10: only the last summary is kept; no frame is retained", async () => {
    const f = factory(() => Promise.resolve(okValue(KITCHEN)));
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    await d.detect(FRAME, 1);
    await d.detect(FRAME, 2);
    for (const value of Object.values(d)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(FRAME);
    }
  });

  it("C10: concurrent frames are refused and do not change the stored summary", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    const first = d.detect(FRAME, 1);
    await flush();
    expect(d.analysing).toBe(true);
    expect(await d.detect(FRAME, 2)).toEqual({ status: "REFUSED", reason: "BUSY" });
    pending.resolve(okValue(KITCHEN));
    expect((await first).status).toBe("OK");
  });

  it("C10: cancel discards a late result without replacing the stored summary", async () => {
    const pending = deferred<unknown>();
    let first = true;
    const f = factory(() => (first ? pending.promise : Promise.resolve(okValue(OFFICE))));
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    const running = d.detect(FRAME, 1);
    await flush();
    d.cancel();
    pending.resolve(okValue(KITCHEN));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(f.created[0]?.cancel).toBe(1);
    first = false;
    // The cancelled frame did not store a summary, so the next frame is a baseline.
    expect(await d.detect(FRAME, 2)).toMatchObject({ status: "OK", change: { state: "BASELINE" } });
  });

  it("C10: cancellation takes precedence over a failing stage", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    const running = d.detect(FRAME, 1);
    await flush();
    d.cancel();
    pending.resolve(undefined);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C10: unexpected failures return STAGE_FAILED and the next frame succeeds", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(KITCHEN)),
    );
    const d = new SceneChangeDetector({ createAnalysis: f.createAnalysis });
    expect(await d.detect(FRAME, 1)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(d.analysing).toBe(false);
    fail = false;
    expect((await d.detect(FRAME, 2)).status).toBe("OK");
  });

  it("C10: malformed dependencies are refused at construction", () => {
    expect(
      () =>
        new SceneChangeDetector({
          createAnalysis: undefined as unknown as () => SceneChangeAnalysis,
        }),
    ).toThrow(SceneChangeError);
    expect(
      () =>
        new SceneChangeDetector({
          createAnalysis: "analysis" as unknown as () => SceneChangeAnalysis,
        }),
    ).toThrow(SceneChangeError);
  });
});
