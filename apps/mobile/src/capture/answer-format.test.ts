import { metaOf, parse } from "./answer-format";

describe("parse", () => {
  it("reads a structured reply: title, answer and up to three follow-ups", () => {
    const parsed = parse(
      JSON.stringify({
        title: "Tea cup",
        answer: "A white cup on a saucer.",
        followups: ["Is it hot?", "What colour?", "Is it clean?", "Extra?"],
      }),
    );
    expect(parsed).toEqual({
      title: "Tea cup",
      text: "A white cup on a saucer.",
      followups: ["Is it hot?", "What colour?", "Is it clean?"],
    });
  });

  it("keeps the whole reply when the model does not follow the format", () => {
    expect(parse("Just a plain sentence.")).toEqual({
      title: "Answer",
      text: "Just a plain sentence.",
      followups: [],
    });
  });

  it("uses defaults for missing fields and drops non-text follow-ups", () => {
    const parsed = parse('{"answer": "Ok", "followups": ["a", 3, null]}');
    expect(parsed.title).toBe("Answer");
    expect(parsed.text).toBe("Ok");
    expect(parsed.followups).toEqual(["a"]);
  });
});

describe("metaOf", () => {
  it("says MOCK when no provider was paid, and shows latency and cost", () => {
    expect(metaOf({ text: "x", latencyMs: 1500, costPaise: 25, source: "mock" })).toBe(
      "MOCK · 1.5 s · ₹0.25",
    );
    expect(metaOf({ text: "x", latencyMs: 800, costPaise: 3, source: "openrouter" })).toBe(
      "0.8 s · ₹0.03",
    );
  });
});
