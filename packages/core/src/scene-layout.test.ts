import { SceneDescriber, SceneDescriberError, parseRelations } from "./scene-layout.js";
import type { SceneAnalysis } from "./scene-layout.js";

const T0 = 1_000;
const FRAME = new Uint8Array([3, 1, 4]);

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

type AnalysisResult = Awaited<ReturnType<SceneAnalysis["analyze"]>>;

function okValue(value: unknown): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: T0 } as unknown as AnalysisResult;
}

function factory(script: () => Promise<unknown> = () => Promise.resolve(okValue(VALID))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): SceneAnalysis => {
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

const VALID = JSON.stringify([
  { subject: "mug", relation: "ON", object: "table", confidence: 0.9 },
  { subject: "lamp", relation: "LEFT_OF", object: "mug", confidence: 0.7 },
]);

describe("scene layout and visual relationships (C05)", () => {
  it("C05: a refusal from the analysis is passed through with no scene", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    expect(await d.describe(FRAME, T0)).toEqual({
      status: "REFUSED",
      reason: "DISCLOSURE_REQUIRED",
    });
  });

  it("C05: unknown relations, bad labels, bad confidence or too many relations are refused", () => {
    const bad = [
      JSON.stringify([
        { subject: "a", relation: "ABOVE_AND_BEHIND", object: "b", confidence: 0.9 },
      ]),
      JSON.stringify([{ subject: "", relation: "ON", object: "b", confidence: 0.9 }]),
      JSON.stringify([{ subject: "a", relation: "ON", object: "b\u0007", confidence: 0.9 }]),
      JSON.stringify([{ subject: "a".repeat(81), relation: "ON", object: "b", confidence: 0.9 }]),
      JSON.stringify([{ subject: "a", relation: "ON", object: "b", confidence: 2 }]),
      JSON.stringify([{ subject: "a", relation: "ON", object: "b", confidence: "0.9" }]),
      JSON.stringify(
        Array.from({ length: 21 }, () => ({
          subject: "a",
          relation: "ON",
          object: "b",
          confidence: 0.9,
        })),
      ),
      "not json",
      JSON.stringify({ subject: "a" }),
    ];
    for (const raw of bad) expect(parseRelations(raw)).toBeNull();
  });

  it("C05: non-string values and malformed envelopes are refused without throwing", async () => {
    const values: unknown[] = [null, undefined, 7, true, [], [1, 2], { subject: "a" }];
    for (const value of values) {
      const f = factory(() => Promise.resolve(okValue(value)));
      const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
      expect(await d.describe(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
    const envelopes: unknown[] = [null, undefined, 42, "OK", {}, { status: "MAYBE", value: VALID }];
    for (const envelope of envelopes) {
      const f = factory(() => Promise.resolve(envelope));
      const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
      expect(await d.describe(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C05: real refusal codes pass through; unknown reasons are malformed", async () => {
    for (const reason of ["NOT_AUTHORIZED", "CAP_REACHED", "TIMEOUT", "SAMPLED_OUT"]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
      expect(await d.describe(FRAME, T0)).toEqual({ status: "REFUSED", reason });
    }
    for (const reason of ["UNKNOWN_PROVIDER_STATUS", "", 5, null, undefined]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
      expect(await d.describe(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C05: low-confidence relations are marked uncertain; empty and ambiguous scenes are marked", async () => {
    const low = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify([{ subject: "a", relation: "BEHIND", object: "b", confidence: 0.2 }]),
        ),
      ),
    );
    const a = await new SceneDescriber({ createAnalysis: low.createAnalysis }).describe(FRAME, T0);
    expect(a).toMatchObject({ status: "OK", state: "AMBIGUOUS" });
    if (a.status === "OK") expect(a.relations[0]?.certainty).toBe("LOW");

    const empty = factory(() => Promise.resolve(okValue("[]")));
    expect(
      await new SceneDescriber({ createAnalysis: empty.createAnalysis }).describe(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      state: "EMPTY",
      relations: [],
    });

    const clear = factory();
    const c = await new SceneDescriber({ createAnalysis: clear.createAnalysis }).describe(
      FRAME,
      T0,
    );
    expect(c).toMatchObject({ status: "OK", state: "DESCRIBED" });
  });

  it("C05: invalid input is refused before any analysis call", async () => {
    const f = factory();
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    expect(await d.describe(new Uint8Array(0), T0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    expect(await d.describe("frame" as unknown as Uint8Array, T0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await d.describe(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(f.created).toHaveLength(0);
  });

  it("C05: concurrent description is refused", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    const first = d.describe(FRAME, T0);
    await flush();
    expect(d.describing).toBe(true);
    expect(await d.describe(FRAME, T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    expect(f.created).toHaveLength(1);
    pending.resolve(okValue(VALID));
    expect((await first).status).toBe("OK");
  });

  it("C05: cancel discards a late provider result", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    const running = d.describe(FRAME, T0);
    await flush();
    d.cancel();
    pending.resolve(okValue(VALID));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(f.created[0]?.cancel).toBe(1);
  });

  it("C05: cancellation takes precedence over a failing stage", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    const running = d.describe(FRAME, T0);
    await flush();
    d.cancel();
    pending.resolve(undefined);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C05: unexpected failures return STAGE_FAILED and recovery works", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(VALID)),
    );
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    expect(await d.describe(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(d.describing).toBe(false);
    fail = false;
    expect((await d.describe(FRAME, T0 + 1)).status).toBe("OK");

    let throwFactory = true;
    const d2 = new SceneDescriber({
      createAnalysis: () => {
        if (throwFactory) throw new Error("factory broke");
        return f.createAnalysis();
      },
    });
    expect(await d2.describe(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    throwFactory = false;
    expect((await d2.describe(FRAME, T0 + 1)).status).toBe("OK");
  });

  it("C05: no frame or response is retained after a description", async () => {
    const f = factory();
    const d = new SceneDescriber({ createAnalysis: f.createAnalysis });
    expect((await d.describe(FRAME, T0)).status).toBe("OK");
    for (const value of Object.values(d)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(VALID);
    }
  });

  it("C05: malformed dependencies are refused at construction", () => {
    expect(
      () => new SceneDescriber({ createAnalysis: undefined as unknown as () => SceneAnalysis }),
    ).toThrow(SceneDescriberError);
    expect(
      () => new SceneDescriber({ createAnalysis: "analysis" as unknown as () => SceneAnalysis }),
    ).toThrow(SceneDescriberError);
  });
});
