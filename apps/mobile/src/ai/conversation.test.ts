import {
  appendTurn,
  directionFor,
  handOver,
  MAX_TURNS,
  type ConversationTurn,
} from "./conversation";

function turn(id: number): ConversationTurn {
  return { id, heard: `heard ${String(id)}`, from: "en", translated: "t", to: "te", uncertain: [] };
}

describe("two-way conversation", () => {
  it("hands the speaking turn to the other language after each exchange", () => {
    expect(handOver("en", "en", "te")).toBe("te");
    expect(handOver("te", "en", "te")).toBe("en");
  });

  it("keeps the speaker when both sides are the same language", () => {
    expect(handOver("en", "en", "en")).toBe("en");
  });

  it("keeps the transcript in order and never longer than the limit", () => {
    let turns: ConversationTurn[] = [];
    for (let id = 1; id <= MAX_TURNS + 5; id += 1) {
      turns = appendTurn(turns, turn(id));
    }
    expect(turns).toHaveLength(MAX_TURNS);
    expect(turns[0]?.id).toBe(6);
    expect(turns[turns.length - 1]?.id).toBe(MAX_TURNS + 5);
  });
});

describe("directionFor (F22)", () => {
  it("translates from the language heard into the other language of the pair", () => {
    expect(directionFor("en", "en", "te")).toEqual({ source: "en", target: "te" });
    expect(directionFor("te", "en", "te")).toEqual({ source: "te", target: "en" });
  });

  it("treats a language outside the pair as the first language of the pair", () => {
    expect(directionFor("hi", "en", "te")).toEqual({ source: "hi", target: "en" });
  });
});
