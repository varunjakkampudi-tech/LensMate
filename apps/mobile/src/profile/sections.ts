/**
 * The Profile screen's sections, in display order. Pure data: the screen renders each section as an expandable card, and
 * tests check that the order and the set of sections stay as specified.
 */
export const PROFILE_SECTIONS = [
  { id: "appearance", title: "Appearance" },
  { id: "voice", title: "Voice and language" },
  { id: "permissions", title: "Camera and microphone" },
  { id: "ai", title: "AI connection" },
  { id: "device", title: "Device and enrolment" },
  { id: "memory", title: "Memory and backup" },
  { id: "accessibility", title: "Accessibility" },
  { id: "diagnostics", title: "Diagnostics" },
  { id: "legal", title: "Legal and privacy" },
] as const;

export type ProfileSectionId = (typeof PROFILE_SECTIONS)[number]["id"];

/** The section that opens expanded when the screen first appears. Everything else starts collapsed. */
export const DEFAULT_OPEN: ProfileSectionId = "accessibility";

export function sectionTitle(id: ProfileSectionId): string {
  const found = PROFILE_SECTIONS.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`unknown profile section ${id}`);
  }
  return found.title;
}
