import { calculateSpend, type PriceEntry, type SpendCalculationInput } from "./spend.js";

/**
 * Prices are the OpenRouter catalogue values recorded in docs/governance/provider-privacy-and-models.md section 4
 * (read 2026-10-24), converted to micro-USD per million tokens: 0.10 USD = 100000, 0.40 = 400000, 0.30 = 300000,
 * 2.50 = 2500000. They are a snapshot the owner has not yet approved, so the source is named in every result.
 */
const SNAPSHOT_SOURCE =
  "docs/governance/provider-privacy-and-models.md section 4 (OpenRouter catalogue, read 2026-10-24)";

const SNAPSHOT: readonly PriceEntry[] = [
  {
    requestType: "text",
    model: "google/gemini-2.5-flash-lite",
    inputMicroUsdPerMillion: 100_000,
    outputMicroUsdPerMillion: 400_000,
  },
  {
    requestType: "vision",
    model: "google/gemini-2.5-flash",
    inputMicroUsdPerMillion: 300_000,
    outputMicroUsdPerMillion: 2_500_000,
  },
];

/**
 * Test values only. The workloads and the exchange rate are illustrative inputs for arithmetic, not measured
 * token counts and not the owner's rate (BROKER_FX_PAISE_PER_USD has no default and is set by the owner).
 */
const TEST_FX_PAISE_PER_USD = 1_000;
const CAP_PAISE = 50_000; // INR 500, the proposed cap in provider-privacy-and-models.md section 7

function input(overrides: Partial<SpendCalculationInput> = {}): SpendCalculationInput {
  return {
    priceSnapshot: SNAPSHOT,
    priceSnapshotSource: SNAPSHOT_SOURCE,
    requests: [
      {
        requestType: "text",
        inputTokensPerRequest: 1000,
        outputTokensPerRequest: 200,
        requestsPerMonth: 10_000,
      },
      {
        requestType: "vision",
        inputTokensPerRequest: 1000,
        outputTokensPerRequest: 100,
        requestsPerMonth: 1_000,
      },
    ],
    capPaise: CAP_PAISE,
    paisePerUsd: TEST_FX_PAISE_PER_USD,
    ...overrides,
  };
}

describe("calculateSpend: arithmetic", () => {
  it("computes cost per request type in micro-USD and paise, from the snapshot prices", () => {
    const result = calculateSpend(input());
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    // text: 1000 * 0.10 / 1e6 USD = 100 micro-USD; 200 * 0.40 / 1e6 USD = 80 micro-USD; total 180.
    // vision: 1000 * 0.30 / 1e6 = 300 micro-USD; 100 * 2.50 / 1e6 = 250 micro-USD; total 550.
    expect(result.perRequest).toEqual([
      { requestType: "text", model: "google/gemini-2.5-flash-lite", microUsd: 180, paise: 1 },
      { requestType: "vision", model: "google/gemini-2.5-flash", microUsd: 550, paise: 1 },
    ]);
  });

  it("projects the month from per-request cost times request volume, then converts once", () => {
    const result = calculateSpend(input());
    if (result.status !== "calculated") {
      throw new Error("expected a calculation");
    }
    // 180 * 10000 + 550 * 1000 = 2,350,000 micro-USD = 2.35 USD; at 1000 paise per USD = 2350 paise.
    expect(result.monthlyMicroUsd).toBe(2_350_000);
    expect(result.monthlyPaise).toBe(2_350);
    expect(result.capPaise).toBe(CAP_PAISE);
    expect(result.withinCap).toBe(true);
    expect(result.headroomPaise).toBe(CAP_PAISE - 2_350);
  });

  it("labels every result CALCULATED, not MEASURED, and names the price snapshot", () => {
    expect(calculateSpend(input())).toMatchObject({
      status: "calculated",
      label: "CALCULATED",
      notMeasured: true,
      priceSnapshotSource: SNAPSHOT_SOURCE,
    });
  });

  it("rounds each token term up, so a single token is never costed at zero", () => {
    const result = calculateSpend(
      input({
        requests: [
          {
            requestType: "text",
            inputTokensPerRequest: 1,
            outputTokensPerRequest: 0,
            requestsPerMonth: 1,
          },
        ],
      }),
    );
    if (result.status !== "calculated") {
      throw new Error("expected a calculation");
    }
    // 1 * 100000 / 1e6 = 0.1 micro-USD, rounded up to 1.
    expect(result.perRequest[0]?.microUsd).toBe(1);
    expect(result.monthlyPaise).toBe(1);
  });

  it("reports a month exactly at the cap as within it, and one paisa more as over", () => {
    expect(calculateSpend(input({ capPaise: 2_350 }))).toMatchObject({
      status: "calculated",
      withinCap: true,
      headroomPaise: 0,
    });
    expect(calculateSpend(input({ capPaise: 2_349 }))).toMatchObject({
      status: "calculated",
      withinCap: false,
      headroomPaise: -1,
    });
  });

  it("projects zero spend for a request type with zero requests per month", () => {
    const result = calculateSpend(
      input({
        requests: [
          {
            requestType: "text",
            inputTokensPerRequest: 1000,
            outputTokensPerRequest: 200,
            requestsPerMonth: 0,
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      status: "calculated",
      monthlyMicroUsd: 0,
      monthlyPaise: 0,
      withinCap: true,
    });
  });
});

describe("calculateSpend: refusals", () => {
  it("refuses to project without an explicit exchange rate", () => {
    const result = calculateSpend(input({ paisePerUsd: undefined }));
    expect(result).toEqual({
      status: "refused",
      reason: "EXCHANGE_RATE_MISSING",
      problems: [expect.stringMatching(/BROKER_FX_PAISE_PER_USD.*no default/)],
    });
    expect(result).not.toHaveProperty("monthlyPaise");
  });

  it("refuses a null exchange rate the same way", () => {
    expect(calculateSpend(input({ paisePerUsd: null }))).toMatchObject({
      status: "refused",
      reason: "EXCHANGE_RATE_MISSING",
    });
  });

  it("refuses an exchange rate that is zero, negative, fractional or not a finite number", () => {
    for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(calculateSpend(input({ paisePerUsd: bad }))).toMatchObject({
        status: "refused",
        reason: "INVALID_INPUT",
      });
    }
  });

  it("refuses a request type that has no price, rather than assuming one", () => {
    const result = calculateSpend(
      input({
        requests: [
          {
            requestType: "translation",
            inputTokensPerRequest: 1,
            outputTokensPerRequest: 1,
            requestsPerMonth: 1,
          },
        ],
      }),
    );
    expect(result).toEqual({
      status: "refused",
      reason: "INVALID_INPUT",
      problems: ["no price in the snapshot for request type translation"],
    });
  });

  it("refuses a projection with no source named for the prices", () => {
    expect(calculateSpend(input({ priceSnapshotSource: "  " }))).toMatchObject({
      status: "refused",
      problems: [expect.stringMatching(/priceSnapshotSource/)],
    });
  });

  it("refuses an empty request list instead of projecting a silent zero", () => {
    expect(calculateSpend(input({ requests: [] }))).toMatchObject({
      status: "refused",
      reason: "INVALID_INPUT",
    });
  });

  it("refuses negative, fractional or unsafe token and volume figures", () => {
    const bad = [
      { inputTokensPerRequest: -1, outputTokensPerRequest: 0, requestsPerMonth: 1 },
      { inputTokensPerRequest: 1.5, outputTokensPerRequest: 0, requestsPerMonth: 1 },
      {
        inputTokensPerRequest: 1,
        outputTokensPerRequest: 0,
        requestsPerMonth: Number.MAX_SAFE_INTEGER + 1,
      },
    ];
    for (const assumption of bad) {
      expect(
        calculateSpend(input({ requests: [{ requestType: "text", ...assumption }] })),
      ).toMatchObject({
        status: "refused",
        reason: "INVALID_INPUT",
      });
    }
  });

  it("refuses a projection whose monthly figure is too large to compute exactly", () => {
    const result = calculateSpend(
      input({
        requests: [
          {
            requestType: "vision",
            inputTokensPerRequest: 0,
            outputTokensPerRequest: 1_000_000,
            requestsPerMonth: 1_000_000_000,
          },
        ],
      }),
    );
    expect(result).toMatchObject({ status: "refused", reason: "INVALID_INPUT" });
  });

  it("refuses a snapshot that lists one request type twice", () => {
    const first = SNAPSHOT[0];
    if (first === undefined) {
      throw new Error("fixture is missing");
    }
    const duplicated: PriceEntry[] = [...SNAPSHOT, { ...first, model: "other/model" }];
    expect(calculateSpend(input({ priceSnapshot: duplicated }))).toMatchObject({
      status: "refused",
      problems: [expect.stringMatching(/more than once/)],
    });
  });
});
