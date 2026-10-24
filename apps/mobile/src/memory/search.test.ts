import { questionWords, relevantNotes } from "./search";
import type { MemoryItem } from "./vault";

function note(id: string, title: string, text: string, createdAt: number): MemoryItem {
  return { id, kind: "note", title, text, createdAt };
}

const PARKING = note("p", "Parking", "I parked on level 2 near the lift", 3);
const UMBRELLA = note("u", "Umbrella", "Bring the blue umbrella", 2);
const PHARMACY = note("h", "Pharmacy", "Collect the prescription", 1);

describe("questionWords", () => {
  it("drops punctuation and common question words", () => {
    expect(questionWords("Where did I park?")).toEqual(["park"]);
    expect(questionWords("What about the umbrella, please?")).toEqual(["umbrella", "please"]);
  });
});

describe("relevantNotes", () => {
  it("finds the note for a question that uses another form of the word", () => {
    expect(relevantNotes([UMBRELLA, PARKING, PHARMACY], "Where did I park?", 8)).toEqual([PARKING]);
  });

  it("ignores question words when looking for matches", () => {
    expect(relevantNotes([UMBRELLA, PHARMACY], "Where did I leave what?", 8)).toEqual([
      UMBRELLA,
      PHARMACY,
    ]);
  });

  it("falls back to the newest notes when nothing matches, keeping the order given", () => {
    expect(relevantNotes([PARKING, UMBRELLA, PHARMACY], "zebra crossing", 2)).toEqual([
      PARKING,
      UMBRELLA,
    ]);
  });

  it("returns matches first and never more than the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => note(`n${i}`, "Lift", `lift ${i}`, i));
    expect(relevantNotes(many, "lift", 6)).toHaveLength(6);
  });
});
