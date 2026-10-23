import {
  MODEL_ALLOWLIST,
  actualMicroUsd,
  findModel,
  microUsdToPaise,
  worstCaseMicroUsd,
} from "./pricing.js";

describe("model allowlist", () => {
  it("contains only the approved text and vision models", () => {
    expect(MODEL_ALLOWLIST.map((model) => model.id)).toEqual([
      "google/gemini-2.5-flash-lite",
      "google/gemini-2.5-flash",
    ]);
  });

  it("refuses any model that is not on the list", () => {
    expect(findModel("openai/gpt-4o")).toBeUndefined();
    expect(findModel("google/gemini-2.5-flash-lite")?.feature).toBe("text");
    expect(findModel("google/gemini-2.5-flash")?.acceptsImages).toBe(true);
  });
});

describe("cost arithmetic in integers", () => {
  const lite = findModel("google/gemini-2.5-flash-lite");
  if (lite === undefined) {
    throw new Error("model missing");
  }

  it("prices tokens per million with exact micro-USD", () => {
    // 1,000,000 input tokens at 0.10 USD per million is 0.10 USD = 100,000 micro-USD.
    expect(actualMicroUsd(lite, 1_000_000, 0)).toBe(100_000);
    // 1,000,000 output tokens at 0.40 USD per million is 400,000 micro-USD.
    expect(actualMicroUsd(lite, 0, 1_000_000)).toBe(400_000);
  });

  it("rounds a fractional micro-USD up, so cost is never understated", () => {
    expect(actualMicroUsd(lite, 1, 0)).toBe(1);
    expect(actualMicroUsd(lite, 0, 0)).toBe(0);
  });

  it("builds the worst case from the input bound and the output cap", () => {
    expect(worstCaseMicroUsd(lite, 1_000_000, 1_000_000)).toBe(500_000);
  });

  it("converts micro-USD to paise rounding up, using the owner's exchange rate", () => {
    // 1 USD at 90 paise per USD is 90 paise.
    expect(microUsdToPaise(1_000_000, 9_000)).toBe(9_000);
    // 1 micro-USD at 90 paise per USD is 0.00009 paise, which rounds up to 1 paisa.
    expect(microUsdToPaise(1, 9_000)).toBe(1);
    expect(microUsdToPaise(0, 9_000)).toBe(0);
  });
});
