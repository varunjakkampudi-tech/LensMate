import { ObjectRecognizer, ObjectRecognizerError, parseRecognition } from "./object-recognition.js";
import type { RecognitionAnalysis } from "./object-recognition.js";

const T0 = 1_000;
const FRAME = new Uint8Array([5, 6, 7]);

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

type AnalysisResult = Awaited<ReturnType<RecognitionAnalysis["analyze"]>>;

function factory(script: () => Promise<AnalysisResult> = () => Promise.resolve(okValue(VALID))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): RecognitionAnalysis => {
    const record = { analyze: 0, cancel: 0 };
    created.push(record);
    return {
      analyze: () => {
        record.analyze += 1;
        return script();
      },
      cancel: () => {
        record.cancel += 1;
      },
    };
  };
  return { createAnalysis, created };
}

function okValue(value: string): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: T0 };
}

const VALID = JSON.stringify([
  { label: "red mug", kind: "OBJECT", confidence: 0.92 },
  { label: "kitchen", kind: "ENVIRONMENT", confidence: 0.7 },
]);

describe("object and environment recognition (C04)", () => {
  it("C04: a refusal from the analysis is passed through with no result", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    expect(await r.recognize(FRAME, T0)).toEqual({
      status: "REFUSED",
      reason: "DISCLOSURE_REQUIRED",
    });
  });

  it("C04: malformed, oversize or over-long provider output is refused", async () => {
    const bad = [
      "not json",
      JSON.stringify({ label: "x", kind: "OBJECT", confidence: 0.9 }),
      JSON.stringify([{ label: "", kind: "OBJECT", confidence: 0.9 }]),
      JSON.stringify([{ label: "x".repeat(81), kind: "OBJECT", confidence: 0.9 }]),
      JSON.stringify([{ label: "bad\u0007label", kind: "OBJECT", confidence: 0.9 }]),
      JSON.stringify([{ label: "x", kind: "PERSON", confidence: 0.9 }]),
      JSON.stringify([{ label: "x", kind: "OBJECT", confidence: 1.5 }]),
      JSON.stringify([{ label: "x", kind: "OBJECT", confidence: "0.9" }]),
      JSON.stringify(
        Array.from({ length: 11 }, () => ({ label: "x", kind: "OBJECT", confidence: 0.9 })),
      ),
      "x".repeat(4097),
    ];
    for (const value of bad) {
      const f = factory(() => Promise.resolve(okValue(value)));
      const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
      expect(await r.recognize(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C04: low confidence is marked as uncertain, never as certain", () => {
    const items = parseRecognition(
      JSON.stringify([{ label: "maybe a cup", kind: "OBJECT", confidence: 0.3 }]),
    );
    expect(items).toEqual([
      { label: "maybe a cup", kind: "OBJECT", confidence: 0.3, certainty: "LOW" },
    ]);
  });

  it("C04: empty and ambiguous results are marked", async () => {
    const empty = factory(() => Promise.resolve(okValue("[]")));
    const e = await new ObjectRecognizer({ createAnalysis: empty.createAnalysis }).recognize(
      FRAME,
      T0,
    );
    expect(e).toMatchObject({ status: "OK", state: "EMPTY", items: [] });

    const ambiguous = factory(() =>
      Promise.resolve(
        okValue(JSON.stringify([{ label: "blur", kind: "OBJECT", confidence: 0.2 }])),
      ),
    );
    const a = await new ObjectRecognizer({ createAnalysis: ambiguous.createAnalysis }).recognize(
      FRAME,
      T0,
    );
    expect(a).toMatchObject({ status: "OK", state: "AMBIGUOUS" });

    const clear = factory();
    const c = await new ObjectRecognizer({ createAnalysis: clear.createAnalysis }).recognize(
      FRAME,
      T0,
    );
    expect(c).toMatchObject({ status: "OK", state: "RECOGNIZED" });
  });

  it("C04: invalid input is refused before any analysis call", async () => {
    const f = factory();
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    expect(await r.recognize(new Uint8Array(0), T0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    expect(await r.recognize("frame" as unknown as Uint8Array, T0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await r.recognize(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(f.created).toHaveLength(0);
  });

  it("C04: concurrent recognition is refused", async () => {
    const pending = deferred<AnalysisResult>();
    const f = factory(() => pending.promise);
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    const first = r.recognize(FRAME, T0);
    await flush();
    expect(r.recognizing).toBe(true);
    expect(await r.recognize(FRAME, T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    expect(f.created).toHaveLength(1);
    pending.resolve(okValue(VALID));
    expect((await first).status).toBe("OK");
  });

  it("C04: cancel discards a late provider result", async () => {
    const pending = deferred<AnalysisResult>();
    const f = factory(() => pending.promise);
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    const running = r.recognize(FRAME, T0);
    await flush();
    r.cancel();
    pending.resolve(okValue(VALID));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(f.created[0]?.cancel).toBe(1);
  });

  it("C04: unexpected failures return STAGE_FAILED and recovery works", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(VALID)),
    );
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    expect(await r.recognize(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(r.recognizing).toBe(false);
    fail = false;
    expect((await r.recognize(FRAME, T0 + 1)).status).toBe("OK");

    let throwFactory = true;
    const r2 = new ObjectRecognizer({
      createAnalysis: () => {
        if (throwFactory) throw new Error("factory broke");
        return f.createAnalysis();
      },
    });
    expect(await r2.recognize(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    throwFactory = false;
    expect((await r2.recognize(FRAME, T0 + 1)).status).toBe("OK");
  });

  it("C04: no frame or response is retained after recognition", async () => {
    const f = factory();
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    expect((await r.recognize(FRAME, T0)).status).toBe("OK");
    for (const value of Object.values(r)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(VALID);
    }
  });

  it("C04: malformed dependencies are refused at construction", () => {
    expect(
      () =>
        new ObjectRecognizer({ createAnalysis: undefined as unknown as () => RecognitionAnalysis }),
    ).toThrow(ObjectRecognizerError);
    expect(
      () =>
        new ObjectRecognizer({
          createAnalysis: "analysis" as unknown as () => RecognitionAnalysis,
        }),
    ).toThrow(ObjectRecognizerError);
  });
});

describe("untrusted provider values (C04 CR-48)", () => {
  const malformedValues: unknown[] = [null, undefined, 7, true, [], [1, 2], { label: "x" }];
  const malformedEnvelopes: unknown[] = [
    null,
    undefined,
    42,
    "OK",
    {},
    { status: "MAYBE", value: VALID },
  ];

  it("C04 CR-48: non-string provider values are refused as MALFORMED_RESPONSE without throwing", async () => {
    for (const value of malformedValues) {
      const f = factory(() =>
        Promise.resolve({ status: "OK", value, analyzedAtMs: T0 } as unknown as AnalysisResult),
      );
      const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
      expect(await r.recognize(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C04 CR-48: malformed success envelopes are refused as MALFORMED_RESPONSE without throwing", async () => {
    for (const envelope of malformedEnvelopes) {
      const f = factory(() => Promise.resolve(envelope as AnalysisResult));
      const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
      expect(await r.recognize(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C04 CR-48: the recognizer stays usable after malformed output", async () => {
    let bad = true;
    const f = factory(() =>
      bad
        ? Promise.resolve({
            status: "OK",
            value: null,
            analyzedAtMs: T0,
          } as unknown as AnalysisResult)
        : Promise.resolve(okValue(VALID)),
    );
    const r = new ObjectRecognizer({ createAnalysis: f.createAnalysis });
    expect(await r.recognize(FRAME, T0)).toEqual({
      status: "REFUSED",
      reason: "MALFORMED_RESPONSE",
    });
    expect(r.recognizing).toBe(false);
    bad = false;
    expect((await r.recognize(FRAME, T0 + 1)).status).toBe("OK");
  });
});
