import { TextReader, TextReaderError, parseReading } from "./visual-text.js";
import type { TextAnalysis } from "./visual-text.js";

const T0 = 1_000;
const FRAME = new Uint8Array([2, 7, 1, 8]);

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

type AnalysisResult = Awaited<ReturnType<TextAnalysis["analyze"]>>;

function okValue(value: unknown): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: T0 } as unknown as AnalysisResult;
}

function factory(script: () => Promise<unknown> = () => Promise.resolve(okValue(VALID))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): TextAnalysis => {
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
  category: "SIGN",
  partial: false,
  regions: [
    { order: 0, text: "EXIT", basis: "EXTRACTED", confidence: 0.95 },
    { order: 1, text: "Level 2", basis: "EXTRACTED", confidence: 0.8 },
  ],
});

describe("reading signs, books, receipts and labels (C06)", () => {
  it("C06: a refusal from the analysis is passed through with no result", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const r = new TextReader({ createAnalysis: f.createAnalysis });
    expect(await r.read(FRAME, T0)).toEqual({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" });
  });

  it("C06: unknown categories, bad shapes and too many regions are refused", () => {
    const region = { order: 0, text: "x", basis: "EXTRACTED", confidence: 0.9 };
    const bad = [
      JSON.stringify({ category: "POSTER", partial: false, regions: [region] }),
      JSON.stringify({ category: "SIGN", partial: "no", regions: [region] }),
      JSON.stringify({ category: "SIGN", partial: false, regions: "many" }),
      JSON.stringify([region]),
      JSON.stringify({
        category: "SIGN",
        partial: false,
        regions: Array.from({ length: 21 }, () => region),
      }),
      "not json",
    ];
    for (const raw of bad) expect(parseReading(raw)).toBeNull();
  });

  it("C06: text, order, basis and confidence are validated", () => {
    const wrap = (region: unknown) =>
      JSON.stringify({ category: "LABEL", partial: false, regions: [region] });
    expect(
      parseReading(wrap({ order: 0, text: "", basis: "EXTRACTED", confidence: 0.9 })),
    ).toBeNull();
    expect(
      parseReading(wrap({ order: 0, text: "x".repeat(301), basis: "EXTRACTED", confidence: 0.9 })),
    ).toBeNull();
    expect(
      parseReading(wrap({ order: 0, text: "bad\u0007", basis: "EXTRACTED", confidence: 0.9 })),
    ).toBeNull();
    expect(
      parseReading(wrap({ order: 0, text: "x", basis: "GUESSED", confidence: 0.9 })),
    ).toBeNull();
    expect(
      parseReading(wrap({ order: 0, text: "x", basis: "EXTRACTED", confidence: 1.2 })),
    ).toBeNull();
    expect(
      parseReading(wrap({ order: 0.5, text: "x", basis: "EXTRACTED", confidence: 0.9 })),
    ).toBeNull();
    // Line breaks are allowed in multiline text.
    expect(
      parseReading(
        wrap({ order: 0, text: "Line one\nLine two", basis: "EXTRACTED", confidence: 0.9 }),
      ),
    ).not.toBeNull();
  });

  it("C06: total text limit is enforced", () => {
    const region = (order: number) => ({
      order,
      text: "x".repeat(250),
      basis: "EXTRACTED",
      confidence: 0.9,
    });
    const regions = Array.from({ length: 9 }, (_v, i) => region(i));
    expect(parseReading(JSON.stringify({ category: "BOOK", partial: false, regions }))).toBeNull();
    expect(
      parseReading(
        JSON.stringify({ category: "BOOK", partial: false, regions: regions.slice(0, 8) }),
      ),
    ).not.toBeNull();
  });

  it("C06: reading order is preserved and broken order is refused", () => {
    const wrap = (regions: unknown[]) =>
      JSON.stringify({ category: "RECEIPT", partial: false, regions });
    const r = (order: number, text: string) => ({
      order,
      text,
      basis: "EXTRACTED",
      confidence: 0.9,
    });
    const ordered = parseReading(wrap([r(0, "TOTAL"), r(1, "12.00")]));
    expect(ordered?.regions.map((x) => x.text)).toEqual(["TOTAL", "12.00"]);
    expect(parseReading(wrap([r(1, "TOTAL"), r(0, "12.00")]))).toBeNull();
    expect(parseReading(wrap([r(0, "TOTAL"), r(0, "12.00")]))).toBeNull();
    expect(parseReading(wrap([r(0, "TOTAL"), r(2, "12.00")]))).toBeNull();
  });

  it("C06: extracted and interpreted text stay distinct", () => {
    const parsed = parseReading(
      JSON.stringify({
        category: "LABEL",
        partial: false,
        regions: [
          { order: 0, text: "Keep cold", basis: "EXTRACTED", confidence: 0.9 },
          { order: 1, text: "probably a dairy product", basis: "INTERPRETED", confidence: 0.9 },
        ],
      }),
    );
    expect(parsed?.regions.map((x) => x.basis)).toEqual(["EXTRACTED", "INTERPRETED"]);
  });

  it("C06: low confidence, empty, ambiguous and partial readings are marked", async () => {
    const low = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({
            category: "SIGN",
            partial: false,
            regions: [{ order: 0, text: "?", basis: "EXTRACTED", confidence: 0.2 }],
          }),
        ),
      ),
    );
    const a = await new TextReader({ createAnalysis: low.createAnalysis }).read(FRAME, T0);
    expect(a).toMatchObject({ status: "OK", state: "AMBIGUOUS" });
    if (a.status === "OK") expect(a.regions[0]?.certainty).toBe("LOW");

    const empty = factory(() =>
      Promise.resolve(okValue(JSON.stringify({ category: "OTHER", partial: false, regions: [] }))),
    );
    expect(
      await new TextReader({ createAnalysis: empty.createAnalysis }).read(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      state: "EMPTY",
    });

    const partial = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({
            category: "BOOK",
            partial: true,
            regions: [{ order: 0, text: "Chapter", basis: "EXTRACTED", confidence: 0.9 }],
          }),
        ),
      ),
    );
    expect(
      await new TextReader({ createAnalysis: partial.createAnalysis }).read(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      state: "PARTIAL",
    });

    const complete = factory();
    expect(
      await new TextReader({ createAnalysis: complete.createAnalysis }).read(FRAME, T0),
    ).toMatchObject({
      status: "OK",
      state: "COMPLETE",
    });
  });

  it("C06: malformed values and envelopes are refused without throwing", async () => {
    for (const value of [null, undefined, 7, true, [], { category: "SIGN" }]) {
      const f = factory(() => Promise.resolve(okValue(value)));
      expect(await new TextReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
    for (const envelope of [null, undefined, 42, "OK", {}, { status: "MAYBE", value: VALID }]) {
      const f = factory(() => Promise.resolve(envelope));
      expect(await new TextReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C06: only real refusal codes pass through", async () => {
    for (const reason of ["NOT_AUTHORIZED", "CAP_REACHED", "TIMEOUT"]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      expect(await new TextReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason,
      });
    }
    for (const reason of ["UNKNOWN_PROVIDER_STATUS", "", 5, null]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      expect(await new TextReader({ createAnalysis: f.createAnalysis }).read(FRAME, T0)).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C06: invalid input is refused before any call; concurrent reads are refused", async () => {
    const f = factory();
    const r = new TextReader({ createAnalysis: f.createAnalysis });
    expect(await r.read(new Uint8Array(0), T0)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await r.read(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(f.created).toHaveLength(0);

    const pending = deferred<unknown>();
    const g = factory(() => pending.promise);
    const busy = new TextReader({ createAnalysis: g.createAnalysis });
    const first = busy.read(FRAME, T0);
    await flush();
    expect(busy.reading).toBe(true);
    expect(await busy.read(FRAME, T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    pending.resolve(okValue(VALID));
    expect((await first).status).toBe("OK");
  });

  it("C06: cancel discards a late result", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const r = new TextReader({ createAnalysis: f.createAnalysis });
    const running = r.read(FRAME, T0);
    await flush();
    r.cancel();
    pending.resolve(okValue(VALID));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(f.created[0]?.cancel).toBe(1);
  });

  it("C06: cancellation takes precedence over a failing stage", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const r = new TextReader({ createAnalysis: f.createAnalysis });
    const running = r.read(FRAME, T0);
    await flush();
    r.cancel();
    pending.resolve(undefined);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C06: unexpected failures return STAGE_FAILED and recovery works", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(VALID)),
    );
    const r = new TextReader({ createAnalysis: f.createAnalysis });
    expect(await r.read(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(r.reading).toBe(false);
    fail = false;
    expect((await r.read(FRAME, T0 + 1)).status).toBe("OK");

    let throwFactory = true;
    const r2 = new TextReader({
      createAnalysis: () => {
        if (throwFactory) throw new Error("factory broke");
        return f.createAnalysis();
      },
    });
    expect(await r2.read(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    throwFactory = false;
    expect((await r2.read(FRAME, T0 + 1)).status).toBe("OK");
  });

  it("C06: no frame or text is retained; malformed dependencies are refused at construction", async () => {
    const f = factory();
    const r = new TextReader({ createAnalysis: f.createAnalysis });
    expect((await r.read(FRAME, T0)).status).toBe("OK");
    for (const value of Object.values(r)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(VALID);
    }
    expect(
      () => new TextReader({ createAnalysis: undefined as unknown as () => TextAnalysis }),
    ).toThrow(TextReaderError);
    expect(
      () => new TextReader({ createAnalysis: "analysis" as unknown as () => TextAnalysis }),
    ).toThrow(TextReaderError);
  });
});
