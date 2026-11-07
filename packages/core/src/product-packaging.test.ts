import { PackagingReader, PackagingReaderError, parsePackaging } from "./product-packaging.js";
import type { PackagingAnalysis } from "./product-packaging.js";

const T0 = 1_000;
const FRAME = new Uint8Array([6, 2, 8]);

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

type AnalysisResult = Awaited<ReturnType<PackagingAnalysis["analyze"]>>;

function okValue(value: unknown): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: T0 } as unknown as AnalysisResult;
}

function factory(script: () => Promise<unknown> = () => Promise.resolve(okValue(VALID))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): PackagingAnalysis => {
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

const VALID = JSON.stringify({
  productName: "Oat Crunch",
  ingredientsState: "COMPLETE",
  partial: false,
  ingredients: [
    { text: "rolled oats", basis: "PRINTED", confidence: 0.95 },
    { text: "cane sugar", basis: "PRINTED", confidence: 0.9 },
  ],
  claims: [{ text: "may contain nuts", topic: "ALLERGEN", basis: "INTERPRETED", confidence: 0.6 }],
});

describe("product packaging and ingredients (C08)", () => {
  it("C08: a refusal from the analysis is passed through with no result", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const r = new PackagingReader({ createAnalysis: f.createAnalysis });
    expect(await r.read(FRAME, T0)).toEqual({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" });
  });

  it("C08: unknown states, bad names, oversize ingredient lists and bad shapes are refused", () => {
    const base = { ingredientsState: "COMPLETE", partial: false, ingredients: [], claims: [] };
    const bad = [
      JSON.stringify({ ...base, ingredientsState: "GUESSED" }),
      JSON.stringify({ ...base, productName: "" }),
      JSON.stringify({ ...base, productName: "x".repeat(121) }),
      JSON.stringify({
        ...base,
        ingredients: Array.from({ length: 61 }, () => ({
          text: "x",
          basis: "PRINTED",
          confidence: 0.9,
        })),
      }),
      JSON.stringify(["not", "an", "object"]),
      "not json",
    ];
    for (const raw of bad) expect(parsePackaging(raw)).toBeNull();
  });

  it("C08: basis and confidence are validated on ingredients and claims", () => {
    const wrap = (ingredients: unknown[], claims: unknown[] = []) =>
      JSON.stringify({ ingredientsState: "COMPLETE", partial: false, ingredients, claims });
    expect(parsePackaging(wrap([{ text: "oats", basis: "GUESSED", confidence: 0.9 }]))).toBeNull();
    expect(parsePackaging(wrap([{ text: "oats", basis: "PRINTED", confidence: 2 }]))).toBeNull();
    expect(
      parsePackaging(wrap([], [{ text: "x", topic: "OTHER", basis: "GUESSED", confidence: 0.5 }])),
    ).toBeNull();
    expect(
      parsePackaging(
        wrap([], [{ text: "x", topic: "UNKNOWN", basis: "INTERPRETED", confidence: 0.5 }]),
      ),
    ).toBeNull();
  });

  it("C08: printed and interpreted content stay distinct", () => {
    const parsed = parsePackaging(VALID);
    expect(parsed?.printed.map((i) => i.text)).toEqual(["rolled oats", "cane sugar"]);
    expect(parsed?.interpretations.map((i) => i.text)).toEqual(["may contain nuts"]);
    const mixed = parsePackaging(
      JSON.stringify({
        ingredientsState: "COMPLETE",
        partial: false,
        ingredients: [{ text: "guessed sugar", basis: "INTERPRETED", confidence: 0.7 }],
        claims: [],
      }),
    );
    expect(mixed?.printed).toEqual([]);
  });

  it("C08: allergy and health statements are never reported as verified or printed", () => {
    const parsed = parsePackaging(VALID);
    expect(parsed?.interpretations[0]).toMatchObject({ verified: false, topic: "ALLERGEN" });
    const printedAllergen = parsePackaging(
      JSON.stringify({
        ingredientsState: "COMPLETE",
        partial: false,
        ingredients: [],
        claims: [
          { text: "contains peanuts", topic: "ALLERGEN", basis: "PRINTED", confidence: 0.9 },
        ],
      }),
    );
    expect(printedAllergen).toBeNull();
  });

  it("C08: unreadable, absent and partial ingredients are reported as such", async () => {
    const unreadable = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({
            ingredientsState: "UNREADABLE",
            partial: false,
            ingredients: [],
            claims: [],
          }),
        ),
      ),
    );
    expect(
      await new PackagingReader({ createAnalysis: unreadable.createAnalysis }).read(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      ingredientsState: "UNREADABLE",
      printedIngredients: [],
    });

    const absent = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({
            ingredientsState: "ABSENT",
            partial: false,
            ingredients: [],
            claims: [],
          }),
        ),
      ),
    );
    expect(
      await new PackagingReader({ createAnalysis: absent.createAnalysis }).read(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      ingredientsState: "ABSENT",
    });

    const partial = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({
            ingredientsState: "COMPLETE",
            partial: true,
            ingredients: [{ text: "oats", basis: "PRINTED", confidence: 0.9 }],
            claims: [],
          }),
        ),
      ),
    );
    expect(
      await new PackagingReader({ createAnalysis: partial.createAnalysis }).read(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      ingredientsState: "PARTIAL",
      partial: true,
    });
  });

  it("C08: malformed values and envelopes are refused without throwing", async () => {
    for (const value of [null, undefined, 3, true, [], { productName: "x" }]) {
      const f = factory(() => Promise.resolve(okValue(value)));
      expect(
        await new PackagingReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0),
      ).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
    for (const envelope of [null, undefined, 42, "OK", {}, { status: "MAYBE", value: VALID }]) {
      const f = factory(() => Promise.resolve(envelope));
      expect(
        await new PackagingReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0),
      ).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C08: only real refusal codes pass through", async () => {
    for (const reason of ["NOT_AUTHORIZED", "CAP_REACHED", "TIMEOUT"]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      expect(
        await new PackagingReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0),
      ).toEqual({ status: "REFUSED", reason });
    }
    for (const reason of ["UNKNOWN_PROVIDER_STATUS", "", 5, null]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      expect(
        await new PackagingReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0),
      ).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C08: invalid input is refused before any call; concurrent reads are refused", async () => {
    const f = factory();
    const r = new PackagingReader({ createAnalysis: f.createAnalysis });
    expect(await r.read(new Uint8Array(0), T0)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await r.read(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(f.created).toHaveLength(0);

    const pending = deferred<unknown>();
    const g = factory(() => pending.promise);
    const busy = new PackagingReader({ createAnalysis: g.createAnalysis });
    const first = busy.read(FRAME, T0);
    await flush();
    expect(busy.reading).toBe(true);
    expect(await busy.read(FRAME, T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    pending.resolve(okValue(VALID));
    expect((await first).status).toBe("OK");
  });

  it("C08: cancel discards a late result", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const r = new PackagingReader({ createAnalysis: f.createAnalysis });
    const running = r.read(FRAME, T0);
    await flush();
    r.cancel();
    pending.resolve(okValue(VALID));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(f.created[0]?.cancel).toBe(1);
  });

  it("C08: cancellation takes precedence over a failing stage", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const r = new PackagingReader({ createAnalysis: f.createAnalysis });
    const running = r.read(FRAME, T0);
    await flush();
    r.cancel();
    pending.resolve(undefined);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C08: unexpected failures return STAGE_FAILED and recovery works", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(VALID)),
    );
    const r = new PackagingReader({ createAnalysis: f.createAnalysis });
    expect(await r.read(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(r.reading).toBe(false);
    fail = false;
    expect((await r.read(FRAME, T0 + 1)).status).toBe("OK");

    let throwFactory = true;
    const r2 = new PackagingReader({
      createAnalysis: () => {
        if (throwFactory) throw new Error("factory broke");
        return f.createAnalysis();
      },
    });
    expect(await r2.read(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    throwFactory = false;
    expect((await r2.read(FRAME, T0 + 1)).status).toBe("OK");
  });

  it("C08: no frame or text is retained; malformed dependencies are refused at construction", async () => {
    const f = factory();
    const r = new PackagingReader({ createAnalysis: f.createAnalysis });
    expect((await r.read(FRAME, T0)).status).toBe("OK");
    for (const value of Object.values(r)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(VALID);
    }
    expect(
      () =>
        new PackagingReader({ createAnalysis: undefined as unknown as () => PackagingAnalysis }),
    ).toThrow(PackagingReaderError);
    expect(
      () =>
        new PackagingReader({ createAnalysis: "analysis" as unknown as () => PackagingAnalysis }),
    ).toThrow(PackagingReaderError);
  });
});
