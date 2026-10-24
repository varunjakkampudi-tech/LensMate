import { PHRASE_IDS } from "./demo-catalogue";
import { DEMO } from "./demo-strings";
import { formatCountdown, normalizePhrase, translateTranscript } from "./demo-translation";

describe("demo translation: phrase normalisation", () => {
  it("lower-cases, removes punctuation and collapses spaces", () => {
    expect(normalizePhrase("  Good  morning, THANK you!  ")).toBe("good morning thank you");
    expect(normalizePhrase("")).toBe("");
  });

  it("keeps every fixed phrase key in normalised form", () => {
    for (const key of Object.keys(DEMO.translation.phraseTable)) {
      expect(normalizePhrase(key)).toBe(key);
    }
  });
});

describe("demo translation: fixed phrase table", () => {
  it("translates a phrase in the table from the table, with no word marked unsure", () => {
    const result = translateTranscript(DEMO.translation.phrases.GREETING);
    expect(result.source).toBe("PHRASE_TABLE");
    expect(result.unsureWords).toEqual([]);
    expect(result.english).toBe("Good morning, thank you");
    expect(result.lines).toEqual([
      { language: "TELUGU", text: DEMO.translation.phraseTable["good morning thank you"].telugu },
      { language: "HINDI", text: DEMO.translation.phraseTable["good morning thank you"].hindi },
    ]);
  });

  it("translates the station phrase from the table", () => {
    const result = translateTranscript(DEMO.translation.phrases.STATION);
    expect(result.source).toBe("PHRASE_TABLE");
    expect(result.unsureWords).toEqual([]);
    expect(result.lines.map((line) => line.language)).toEqual(["TELUGU", "HINDI"]);
  });
});

describe("demo translation: phrase not in the table", () => {
  it("looks up each word, and marks every word not in the word table as unsure", () => {
    const result = translateTranscript(DEMO.translation.phrases.NOT_IN_TABLE);
    expect(result.source).toBe("WORD_TABLE");
    expect(result.unsureWords).toEqual(["quantum", "orchard"]);
    const [telugu, hindi] = result.lines;
    expect(telugu?.text).toBe(
      `${DEMO.translation.wordTable.please.telugu} ${DEMO.translation.wordTable.help.telugu} quantum (${DEMO.translation.unsure}) orchard (${DEMO.translation.unsure})`,
    );
    expect(hindi?.text).toBe(
      `${DEMO.translation.wordTable.please.hindi} ${DEMO.translation.wordTable.help.hindi} quantum (${DEMO.translation.unsure}) orchard (${DEMO.translation.unsure})`,
    );
  });

  it("marks every word unsure when no word is in the table", () => {
    const result = translateTranscript("Zephyr vortex");
    expect(result.source).toBe("WORD_TABLE");
    expect(result.unsureWords).toEqual(["zephyr", "vortex"]);
    expect(result.lines[0]?.text).toBe(
      `zephyr (${DEMO.translation.unsure}) vortex (${DEMO.translation.unsure})`,
    );
  });

  it("returns no words for an empty phrase", () => {
    const result = translateTranscript("   ");
    expect(result.source).toBe("WORD_TABLE");
    expect(result.unsureWords).toEqual([]);
    expect(result.lines.map((line) => line.text)).toEqual(["", ""]);
  });

  it("covers every synthetic phrase with a translation in both languages", () => {
    for (const id of PHRASE_IDS) {
      const result = translateTranscript(DEMO.translation.phrases[id]);
      expect(result.lines.map((line) => line.language)).toEqual(["TELUGU", "HINDI"]);
      for (const line of result.lines) {
        expect(line.text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("demo translation: countdown text", () => {
  it.each([
    [120_000, "2:00"],
    [119_001, "2:00"],
    [119_000, "1:59"],
    [10_000, "0:10"],
    [1_000, "0:01"],
    [0, "0:00"],
    [-500, "0:00"],
  ])("formats %i ms as %s, rounding up to whole seconds", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});
