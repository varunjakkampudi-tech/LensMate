import { ACTIVE_PHASE, FEATURES, type FeatureKey } from "./prefs";

describe("feature switches for the active phase", () => {
  it("keeps the approved active-phase features on by default", () => {
    const activeOnByDefault: FeatureKey[] = [
      "vision",
      "talk",
      "translate",
      "memory",
      "reminders",
      "checks",
    ];
    for (const key of activeOnByDefault) {
      expect(ACTIVE_PHASE[key]).toBe(true);
    }
  });

  it("switches interview practice and agents and automations off by default", () => {
    expect(ACTIVE_PHASE.interview).toBe(false);
    expect(ACTIVE_PHASE.tasks).toBe(false);
  });

  it("lists every feature the Profile screen can switch", () => {
    expect(Object.keys(ACTIVE_PHASE).sort()).toEqual(Object.keys(FEATURES).sort());
  });
});
