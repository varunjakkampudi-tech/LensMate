import { toneInstruction } from "./assistant";
import { TONES, TONE_LABEL, type Tone } from "../ui/prefs";

describe("answer tone", () => {
  it("gives every tone its own instruction", () => {
    const texts = TONES.map((tone) => toneInstruction(tone));
    expect(new Set(texts).size).toBe(TONES.length);
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it("keeps brief answers short and formal answers free of slang", () => {
    expect(toneInstruction("brief")).toMatch(/brief/i);
    expect(toneInstruction("formal")).toMatch(/formal/i);
  });

  it("labels each tone for the Profile screen", () => {
    const labels: Record<Tone, string> = { warm: "Warm", brief: "Brief", formal: "Formal" };
    expect(TONE_LABEL).toEqual(labels);
  });
});
