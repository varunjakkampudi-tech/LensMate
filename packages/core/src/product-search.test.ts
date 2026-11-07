import {
  ProductSearcher,
  ProductSearchError,
  classify,
  parseCandidates,
  parseObservation,
} from "./product-search.js";
import type { IdentifyAnalysis, ObservedProduct } from "./product-search.js";

const T0 = 1_000;
const FRAME = new Uint8Array([9, 9, 1]);

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

type AnalysisResult = Awaited<ReturnType<IdentifyAnalysis["analyze"]>>;

function okValue(value: unknown): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: T0 } as unknown as AnalysisResult;
}

const OBSERVED = JSON.stringify({
  name: "Oat Crunch",
  brand: "Acme",
  basis: "OBSERVED",
  confidence: 0.9,
});

const CANDIDATES = [
  {
    title: "Acme Oat Crunch 500g",
    brand: "Acme",
    source: "shop-a",
    price: 3.5,
    currency: "GBP",
    availability: "IN_STOCK",
  },
  {
    title: "Oat Crunch family pack",
    brand: null,
    source: "shop-b",
    price: null,
    currency: null,
    availability: "UNKNOWN",
  },
];

function factory(script: () => Promise<unknown> = () => Promise.resolve(okValue(OBSERVED))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): IdentifyAnalysis => {
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

function searchFn(results: () => Promise<unknown> = () => Promise.resolve(CANDIDATES)) {
  const calls: Array<{ name: string; brand: string | null }> = [];
  const search = (name: string, brand: string | null) => {
    calls.push({ name, brand });
    return results();
  };
  return { search, calls };
}

describe("visual product search and comparison (C09)", () => {
  it("C09: a refusal from the analysis passes through and no search is made", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    expect(await p.find(FRAME, T0)).toEqual({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" });
    expect(s.calls).toHaveLength(0);
  });

  it("C09: malformed observations are refused", () => {
    const bad = [
      JSON.stringify({ name: "", brand: "Acme", basis: "OBSERVED", confidence: 0.9 }),
      JSON.stringify({ name: "x".repeat(121), brand: null, basis: "OBSERVED", confidence: 0.9 }),
      JSON.stringify({ name: "Oat\u0007", brand: null, basis: "OBSERVED", confidence: 0.9 }),
      JSON.stringify({ name: "Oat", brand: null, basis: "INFERRED", confidence: 0.9 }),
      JSON.stringify({ name: "Oat", brand: null, basis: "OBSERVED", confidence: 2 }),
      "not json",
    ];
    for (const raw of bad) expect(parseObservation(raw)).toBeNull();
  });

  it("C09: malformed search results are refused as SEARCH_FAILED", async () => {
    const bad: unknown[] = [
      "not an array",
      [
        {
          title: "",
          brand: null,
          source: "s",
          price: 1,
          currency: "GBP",
          availability: "IN_STOCK",
        },
      ],
      [
        {
          title: "x",
          brand: null,
          source: "s",
          price: -1,
          currency: "GBP",
          availability: "IN_STOCK",
        },
      ],
      [
        {
          title: "x",
          brand: null,
          source: "s",
          price: 1,
          currency: "pounds",
          availability: "IN_STOCK",
        },
      ],
      [{ title: "x", brand: null, source: "s", price: 1, currency: "GBP", availability: "MAYBE" }],
      Array.from({ length: 21 }, () => ({
        title: "x",
        brand: null,
        source: "s",
        price: null,
        currency: null,
        availability: "UNKNOWN",
      })),
    ];
    for (const raw of bad) expect(parseCandidates(raw)).toBeNull();

    const f = factory();
    const s = searchFn(() =>
      Promise.resolve([
        {
          title: "",
          brand: null,
          source: "s",
          price: 1,
          currency: "GBP",
          availability: "IN_STOCK",
        },
      ]),
    );
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    expect(await p.find(FRAME, T0)).toEqual({ status: "REFUSED", reason: "SEARCH_FAILED" });
  });

  it("C09: observed details and external candidates stay separate", async () => {
    const f = factory();
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    const result = await p.find(FRAME, T0);
    expect(result).toMatchObject({
      status: "OK",
      observed: { name: "Oat Crunch", brand: "Acme", basis: "OBSERVED" },
    });
    if (result.status === "OK") {
      expect(result.matches[0]).toMatchObject({ external: true, verified: false });
    }
  });

  it("C09: likely, uncertain, conflicting and no-match candidates are classified", () => {
    const observed: ObservedProduct = {
      name: "Oat Crunch",
      brand: "Acme",
      basis: "OBSERVED",
      confidence: 0.9,
    };
    const base = { source: "s", price: null, currency: null, availability: "UNKNOWN" as const };
    expect(classify(observed, { ...base, title: "Acme Oat Crunch 500g", brand: "Acme" })).toBe(
      "LIKELY",
    );
    expect(classify(observed, { ...base, title: "Oat Crunch family pack", brand: null })).toBe(
      "LIKELY",
    );
    expect(classify(observed, { ...base, title: "Muesli", brand: null })).toBe("UNCERTAIN");
    expect(classify(observed, { ...base, title: "Oat Crunch", brand: "Other Co" })).toBe(
      "CONFLICT",
    );
  });

  it("C09: a missing brand is never treated as a conflict", () => {
    const observed: ObservedProduct = {
      name: "Oat Crunch",
      brand: "Acme",
      basis: "OBSERVED",
      confidence: 0.9,
    };
    expect(
      classify(observed, {
        title: "Oat Crunch",
        brand: null,
        source: "s",
        price: null,
        currency: null,
        availability: "UNKNOWN",
      }),
    ).toBe("LIKELY");
  });

  it("C09: unknown information is reported as unknown", async () => {
    const f = factory();
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    const result = await p.find(FRAME, T0);
    if (result.status !== "OK") throw new Error("expected OK");
    const family = result.matches.find((m) => m.title === "Oat Crunch family pack");
    expect(family).toMatchObject({ price: null, currency: null, availability: "UNKNOWN" });
  });

  it("C09: invalid input is refused before any call; concurrent identifications are refused", async () => {
    const f = factory();
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    expect(await p.find(new Uint8Array(0), T0)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await p.find(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(f.created).toHaveLength(0);

    const pending = deferred<unknown>();
    const g = factory(() => pending.promise);
    const busy = new ProductSearcher({ createAnalysis: g.createAnalysis, search: s.search });
    const first = busy.find(FRAME, T0);
    await flush();
    expect(busy.identifying).toBe(true);
    expect(await busy.find(FRAME, T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    pending.resolve(okValue(OBSERVED));
    expect((await first).status).toBe("OK");
  });

  it("C09: cancel discards a late result and prevents the search", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    const running = p.find(FRAME, T0);
    await flush();
    p.cancel();
    pending.resolve(okValue(OBSERVED));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(s.calls).toHaveLength(0);
    expect(f.created[0]?.cancel).toBe(1);
  });

  it("C09: cancellation takes precedence over a failing stage", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    const running = p.find(FRAME, T0);
    await flush();
    p.cancel();
    pending.resolve(undefined);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C09: unexpected failures return STAGE_FAILED and recovery works", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(OBSERVED)),
    );
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    expect(await p.find(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(p.identifying).toBe(false);
    fail = false;
    expect((await p.find(FRAME, T0 + 1)).status).toBe("OK");

    const failingSearch = searchFn(() => Promise.reject(new Error("search down")));
    const q = new ProductSearcher({
      createAnalysis: f.createAnalysis,
      search: failingSearch.search,
    });
    expect(await q.find(FRAME, T0)).toEqual({ status: "REFUSED", reason: "SEARCH_FAILED" });
  });

  it("C09: no frame or candidate is retained; malformed dependencies are refused at construction", async () => {
    const f = factory();
    const s = searchFn();
    const p = new ProductSearcher({ createAnalysis: f.createAnalysis, search: s.search });
    expect((await p.find(FRAME, T0)).status).toBe("OK");
    for (const value of Object.values(p)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(OBSERVED);
    }
    expect(
      () =>
        new ProductSearcher({
          createAnalysis: undefined as unknown as () => IdentifyAnalysis,
          search: s.search,
        }),
    ).toThrow(ProductSearchError);
    expect(
      () =>
        new ProductSearcher({
          createAnalysis: f.createAnalysis,
          search: "search" as unknown as () => Promise<unknown>,
        }),
    ).toThrow(ProductSearchError);
  });
});
