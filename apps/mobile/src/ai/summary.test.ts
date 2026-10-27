import { NothingToSummarise, SUMMARY_RULE, summariseConversation, transcriptOf } from "./summary";

describe("transcriptOf", () => {
  it("labels each line by who said it and drops empty lines", () => {
    expect(
      transcriptOf([
        { role: "user", text: "Where is the station?" },
        { role: "assistant", text: "  Two streets ahead.  " },
        { role: "user", text: "   " },
      ]),
    ).toBe("User: Where is the station?\nAssistant: Two streets ahead.");
  });

  it("keeps only the newest 20 lines", () => {
    const lines = Array.from({ length: 25 }, (_, i) => ({ role: "user" as const, text: `q${i}` }));
    const transcript = transcriptOf(lines);
    expect(transcript.split("\n")).toHaveLength(20);
    expect(transcript.startsWith("User: q5\n")).toBe(true);
    expect(transcript.endsWith("User: q24")).toBe(true);
  });

  it("cuts a very long line so one message cannot make the summary request large", () => {
    const transcript = transcriptOf([{ role: "assistant", text: "a".repeat(5000) }]);
    expect(transcript.length).toBeLessThanOrEqual("Assistant: ".length + 600);
  });
});

describe("summariseConversation", () => {
  it("refuses an empty conversation without contacting the AI", async () => {
    await expect(summariseConversation([], "en")).rejects.toBeInstanceOf(NothingToSummarise);
    await expect(
      summariseConversation([{ role: "user", text: "  " }], "en"),
    ).rejects.toBeInstanceOf(NothingToSummarise);
  });

  it("asks for a short plain summary that adds no facts", () => {
    expect(SUMMARY_RULE).toMatch(/2-4 short sentences/);
    expect(SUMMARY_RULE).toMatch(/Add no facts/);
    expect(SUMMARY_RULE).toMatch(/Plain text/);
  });
});
