import { DEFAULT_OPEN, PROFILE_SECTIONS, sectionTitle, type ProfileSectionId } from "./sections";

describe("profile sections", () => {
  it("lists the eleven required sections in the required order", () => {
    expect(PROFILE_SECTIONS.map((s) => s.title)).toEqual([
      "Appearance",
      "Voice and language",
      "Camera and microphone",
      "AI connection",
      "Device and enrolment",
      "Memory and backup",
      "Notifications",
      "Accessibility",
      "Diagnostics",
      "Advanced features",
      "Legal and privacy",
    ]);
  });

  it("has no duplicate section ids", () => {
    const ids = PROFILE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ends with Legal and privacy", () => {
    expect(PROFILE_SECTIONS[PROFILE_SECTIONS.length - 1]?.id).toBe("legal");
  });

  it("opens Accessibility by default and that section exists", () => {
    expect(DEFAULT_OPEN).toBe("accessibility");
    expect(PROFILE_SECTIONS.some((s) => s.id === DEFAULT_OPEN)).toBe(true);
  });

  it("returns the title for a known id and throws for an unknown one", () => {
    expect(sectionTitle("ai" as ProfileSectionId)).toBe("AI connection");
    expect(() => sectionTitle("missing" as ProfileSectionId)).toThrow("unknown profile section");
  });
});
