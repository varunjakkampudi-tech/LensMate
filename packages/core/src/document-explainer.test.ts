import {
  DocumentExplainer,
  DocumentExplainerError,
  parseExplanation,
} from "./document-explainer.js";
import type { ExplainAnalysis } from "./document-explainer.js";

const T0 = 1_000;
const FRAME = new Uint8Array([4, 4, 2]);

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

type AnalysisResult = Awaited<ReturnType<ExplainAnalysis["analyze"]>>;

function okValue(value: unknown): AnalysisResult {
  return { status: "OK", value, analyzedAtMs: T0 } as unknown as AnalysisResult;
}

function factory(script: () => Promise<unknown> = () => Promise.resolve(okValue(VALID))) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): ExplainAnalysis => {
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
  subject: "GRAPH",
  partial: false,
  elements: [
    { id: "axis-x", text: "Time (s)", basis: "EXTRACTED", confidence: 0.95 },
    { id: "peak", text: null, basis: "OBSERVED", confidence: 0.85 },
  ],
  explanations: [{ text: "The curve peaks early.", citations: ["peak"], confidence: 0.8 }],
});

describe("reading and explaining documents, graphs and diagrams (C07)", () => {
  it("C07: a refusal from the analysis is passed through with no result", async () => {
    const f = factory(() => Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }));
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    expect(await d.explain(FRAME, T0)).toEqual({
      status: "REFUSED",
      reason: "DISCLOSURE_REQUIRED",
    });
  });

  it("C07: unknown kinds, bad ids, bad bases, bad confidence and oversize lists are refused", () => {
    const el = { id: "a", text: "x", basis: "EXTRACTED", confidence: 0.9 };
    const bad = [
      JSON.stringify({ subject: "POSTER", partial: false, elements: [el], explanations: [] }),
      JSON.stringify({
        subject: "GRAPH",
        partial: false,
        elements: [{ ...el, id: "Bad Id" }],
        explanations: [],
      }),
      JSON.stringify({
        subject: "GRAPH",
        partial: false,
        elements: [{ ...el, basis: "GUESSED" }],
        explanations: [],
      }),
      JSON.stringify({
        subject: "GRAPH",
        partial: false,
        elements: [{ ...el, confidence: 3 }],
        explanations: [],
      }),
      JSON.stringify({ subject: "GRAPH", partial: false, elements: [el, el], explanations: [] }),
      JSON.stringify({
        subject: "GRAPH",
        partial: false,
        elements: Array.from({ length: 51 }, (_v, i) => ({ ...el, id: "e" + String(i) })),
        explanations: [],
      }),
      "not json",
    ];
    for (const raw of bad) expect(parseExplanation(raw)).toBeNull();
  });

  it("C07: citing a non-existent element is refused with UNSUPPORTED_REFERENCE", async () => {
    const raw = JSON.stringify({
      subject: "DIAGRAM",
      partial: false,
      elements: [{ id: "box", text: "Start", basis: "EXTRACTED", confidence: 0.9 }],
      explanations: [{ text: "Flows to the end.", citations: ["ghost"], confidence: 0.7 }],
    });
    const f = factory(() => Promise.resolve(okValue(raw)));
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    expect(await d.explain(FRAME, T0)).toEqual({
      status: "REFUSED",
      reason: "UNSUPPORTED_REFERENCE",
    });
  });

  it("C07: citation count is bounded", () => {
    const elements = Array.from({ length: 12 }, (_v, i) => ({
      id: "e" + String(i),
      text: "x",
      basis: "EXTRACTED",
      confidence: 0.9,
    }));
    const citations = elements.map((e) => e.id);
    const raw = JSON.stringify({
      subject: "GRAPH",
      partial: false,
      elements,
      explanations: [{ text: "Many.", citations, confidence: 0.9 }],
    });
    expect(parseExplanation(raw)).toBeNull();
  });

  it("C07: an explanation without evidence is marked UNSUPPORTED", () => {
    const raw = JSON.stringify({
      subject: "GRAPH",
      partial: false,
      elements: [{ id: "axis", text: "x", basis: "EXTRACTED", confidence: 0.9 }],
      explanations: [{ text: "This probably means growth.", citations: [], confidence: 0.6 }],
    });
    const parsed = parseExplanation(raw);
    expect(parsed?.kind === "OK" ? parsed.explanations[0]?.support : null).toBe("UNSUPPORTED");
    const supported = parseExplanation(VALID);
    expect(supported?.kind === "OK" ? supported.explanations[0]?.support : null).toBe("SUPPORTED");
  });

  it("C07: elements and explanations stay separate", () => {
    const parsed = parseExplanation(VALID);
    expect(parsed?.kind === "OK" ? parsed.elements.map((e) => e.basis) : []).toEqual([
      "EXTRACTED",
      "OBSERVED",
    ]);
    expect(parsed?.kind === "OK" ? parsed.explanations.map((e) => e.text) : []).toEqual([
      "The curve peaks early.",
    ]);
  });

  it("C07: low confidence, empty, ambiguous and partial readings are marked", async () => {
    const low = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({
            subject: "GRAPH",
            partial: false,
            elements: [{ id: "a", text: "?", basis: "OBSERVED", confidence: 0.2 }],
            explanations: [],
          }),
        ),
      ),
    );
    expect(
      await new DocumentExplainer({ createAnalysis: low.createAnalysis }).explain(FRAME, T0),
    ).toMatchObject({ state: "AMBIGUOUS" });

    const empty = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({ subject: "DOCUMENT", partial: false, elements: [], explanations: [] }),
        ),
      ),
    );
    expect(
      await new DocumentExplainer({ createAnalysis: empty.createAnalysis }).explain(FRAME, T0),
    ).toMatchObject({ state: "EMPTY", partial: false });

    const partial = factory(() =>
      Promise.resolve(
        okValue(
          JSON.stringify({ subject: "DOCUMENT", partial: true, elements: [], explanations: [] }),
        ),
      ),
    );
    expect(
      await new DocumentExplainer({ createAnalysis: partial.createAnalysis }).explain(FRAME, T0),
    ).toMatchObject({ state: "PARTIAL", partial: true });

    const complete = factory();
    expect(
      await new DocumentExplainer({ createAnalysis: complete.createAnalysis }).explain(FRAME, T0),
    ).toMatchObject({ state: "COMPLETE" });
  });

  it("C07: malformed values and envelopes are refused without throwing", async () => {
    for (const value of [null, undefined, 9, true, [], { subject: "GRAPH" }]) {
      const f = factory(() => Promise.resolve(okValue(value)));
      expect(
        await new DocumentExplainer({ createAnalysis: f.createAnalysis }).explain(FRAME, T0),
      ).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
    for (const envelope of [null, undefined, 42, "OK", {}, { status: "MAYBE", value: VALID }]) {
      const f = factory(() => Promise.resolve(envelope));
      expect(
        await new DocumentExplainer({ createAnalysis: f.createAnalysis }).explain(FRAME, T0),
      ).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C07: only real refusal codes pass through", async () => {
    for (const reason of ["NOT_AUTHORIZED", "CAP_REACHED", "TIMEOUT"]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      expect(
        await new DocumentExplainer({ createAnalysis: f.createAnalysis }).explain(FRAME, T0),
      ).toEqual({ status: "REFUSED", reason });
    }
    for (const reason of ["UNKNOWN_PROVIDER_STATUS", "", 5, null]) {
      const f = factory(() => Promise.resolve({ status: "REFUSED", reason }));
      expect(
        await new DocumentExplainer({ createAnalysis: f.createAnalysis }).explain(FRAME, T0),
      ).toEqual({
        status: "REFUSED",
        reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("C07: invalid input is refused before any call; concurrent explanations are refused", async () => {
    const f = factory();
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    expect(await d.explain(new Uint8Array(0), T0)).toEqual({
      status: "REFUSED",
      reason: "BAD_INPUT",
    });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await d.explain(FRAME, bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(f.created).toHaveLength(0);

    const pending = deferred<unknown>();
    const g = factory(() => pending.promise);
    const busy = new DocumentExplainer({ createAnalysis: g.createAnalysis });
    const first = busy.explain(FRAME, T0);
    await flush();
    expect(busy.explaining).toBe(true);
    expect(await busy.explain(FRAME, T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    pending.resolve(okValue(VALID));
    expect((await first).status).toBe("OK");
  });

  it("C07: cancel discards a late result", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    const running = d.explain(FRAME, T0);
    await flush();
    d.cancel();
    pending.resolve(okValue(VALID));
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(f.created[0]?.cancel).toBe(1);
  });

  it("C07: cancellation takes precedence over a failing stage", async () => {
    const pending = deferred<unknown>();
    const f = factory(() => pending.promise);
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    const running = d.explain(FRAME, T0);
    await flush();
    d.cancel();
    pending.resolve(undefined);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C07: unexpected failures return STAGE_FAILED and recovery works", async () => {
    let fail = true;
    const f = factory(() =>
      fail ? Promise.reject(new Error("provider crashed")) : Promise.resolve(okValue(VALID)),
    );
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    expect(await d.explain(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    expect(d.explaining).toBe(false);
    fail = false;
    expect((await d.explain(FRAME, T0 + 1)).status).toBe("OK");

    let throwFactory = true;
    const d2 = new DocumentExplainer({
      createAnalysis: () => {
        if (throwFactory) throw new Error("factory broke");
        return f.createAnalysis();
      },
    });
    expect(await d2.explain(FRAME, T0)).toEqual({ status: "REFUSED", reason: "STAGE_FAILED" });
    throwFactory = false;
    expect((await d2.explain(FRAME, T0 + 1)).status).toBe("OK");
  });

  it("C07: no frame or text is retained; malformed dependencies are refused at construction", async () => {
    const f = factory();
    const d = new DocumentExplainer({ createAnalysis: f.createAnalysis });
    expect((await d.explain(FRAME, T0)).status).toBe("OK");
    for (const value of Object.values(d)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe(VALID);
    }
    expect(
      () =>
        new DocumentExplainer({ createAnalysis: undefined as unknown as () => ExplainAnalysis }),
    ).toThrow(DocumentExplainerError);
    expect(
      () =>
        new DocumentExplainer({ createAnalysis: "analysis" as unknown as () => ExplainAnalysis }),
    ).toThrow(DocumentExplainerError);
  });
});
