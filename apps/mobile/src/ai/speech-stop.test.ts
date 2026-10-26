import { matchesStopWord } from "./speech";

describe("matchesStopWord", () => {
  it("accepts a stop word spoken on its own, in any case and with punctuation", () => {
    expect(matchesStopWord("Stop")).toBe(true);
    expect(matchesStopWord("stop.")).toBe(true);
    expect(matchesStopWord("  Please stop! ")).toBe(true);
    expect(matchesStopWord("ఆపు")).toBe(true);
    expect(matchesStopWord("रुको")).toBe(true);
  });

  it("ignores a stop word inside a sentence, so the answer cannot stop itself", () => {
    expect(matchesStopWord("stop at the next signal")).toBe(false);
    expect(matchesStopWord("don't stop the bus")).toBe(false);
    expect(matchesStopWord("the shop")).toBe(false);
  });

  it("ignores empty or unrelated speech", () => {
    expect(matchesStopWord("")).toBe(false);
    expect(matchesStopWord("   ")).toBe(false);
    expect(matchesStopWord("thank you")).toBe(false);
  });
});
