import {
  MODEL_ALLOWLIST,
  TEMPLATE_ALLOWANCE_TOKENS,
  actualMicroUsd,
  findModel,
  microUsdToPaise,
  worstCaseMicroUsd,
} from "./pricing.js";

describe("model allowlist", () => {
  it("contains only the approved text and vision models", () => {
    expect(MODEL_ALLOWLIST.map((model) => model.id)).toEqual([
      "google/gemini-3.1-flash-lite",
      "openai/gpt-4.1-nano",
      "openai/gpt-4o-mini",
      "google/gemini-3.5-flash-lite",
    ]);
  });

  it("refuses any model that is not on the list", () => {
    expect(findModel("openai/gpt-4o")).toBeUndefined();
    expect(findModel("google/gemini-3.1-flash-lite")?.feature).toBe("text");
    expect(findModel("google/gemini-3.5-flash-lite")?.acceptsImages).toBe(true);
  });

  it("allows the verified GPT text and vision models at the ZDR price ceilings", () => {
    expect(findModel("openai/gpt-4.1-nano")).toMatchObject({
      feature: "text",
      inputMicroUsdPerMillion: 110_000,
      outputMicroUsdPerMillion: 440_000,
    });
    expect(findModel("openai/gpt-4o-mini")).toMatchObject({
      feature: "vision",
      acceptsImages: true,
    });
  });

  it("refuses the :online web-research variant until its zero-retention compatibility is verified", () => {
    expect(findModel("google/gemini-3.1-flash-lite:online")).toBeUndefined();
  });
});

describe("cost arithmetic in integers", () => {
  const lite = findModel("google/gemini-3.1-flash-lite");
  if (lite === undefined) {
    throw new Error("model missing");
  }

  it("prices tokens per million with exact micro-USD", () => {
    // 1,000,000 input tokens at 0.10 USD per million is 0.10 USD = 100,000 micro-USD.
    expect(actualMicroUsd(lite, 1_000_000, 0)).toBe(450_000);
    // 1,000,000 output tokens at 0.40 USD per million is 400,000 micro-USD.
    expect(actualMicroUsd(lite, 0, 1_000_000)).toBe(2_700_000);
  });

  it("rounds a fractional micro-USD up, so cost is never understated", () => {
    expect(actualMicroUsd(lite, 1, 0)).toBe(1);
    expect(actualMicroUsd(lite, 0, 0)).toBe(0);
  });

  it("builds the worst case from the input bound and the output cap", () => {
    expect(worstCaseMicroUsd(lite, 1_000_000, 1_000_000)).toBe(3_150_000);
  });

  it("converts micro-USD to paise rounding up, using the owner's exchange rate", () => {
    // 1 USD at 100 rupees (10,000 paise) per USD is 10,000 paise.
    expect(microUsdToPaise(1_000_000, 10_000)).toBe(10_000);
    // 1 micro-USD at 10,000 paise per USD is 0.01 paise, which rounds up to 1 paisa.
    expect(microUsdToPaise(1, 10_000)).toBe(1);
    expect(microUsdToPaise(0, 10_000)).toBe(0);
  });
});

describe("the reservation covers the real cost", () => {
  it("never reserves less than the cost of the largest allowed request, for every allowlisted model", () => {
    // A token is at least one UTF-8 byte, so the bytes of the largest allowed input plus the template allowance bound
    // the prompt tokens. Output is capped by the broker's ceiling. The bound holds only while that rule holds.
    // The defaults in config.ts. An operator who raises either limit must keep this holding for the new values.
    const maxInputBytes = 16_384;
    const maxOutputTokens = 512;
    const promptBound = maxInputBytes + TEMPLATE_ALLOWANCE_TOKENS;
    for (const model of MODEL_ALLOWLIST) {
      const worst = worstCaseMicroUsd(model, promptBound, maxOutputTokens);
      const actual = actualMicroUsd(model, promptBound, maxOutputTokens);
      expect(actual).toBeLessThanOrEqual(worst);
    }
  });
});
