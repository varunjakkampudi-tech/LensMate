import { REGISTRY } from "./registry";
import { inFilter, summarise } from "./readiness-section";
import { stateOf } from "./model";
import { OWNER_REPORTS } from "./owner-reports";

describe("readiness filters and summary", () => {
  it("counts every entry in exactly one state", () => {
    const counts = summarise(REGISTRY);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(REGISTRY.length);
  });

  it("shows no Ready feature in any filter while there is no device evidence", () => {
    expect(summarise(REGISTRY).Ready).toBe(0);
  });

  it("keeps future rows out of the Features and P-1 counts", () => {
    const features = REGISTRY.filter((e) => inFilter(e, "features"));
    expect(features.every((e) => e.status !== "NOT_DUE")).toBe(true);
    const p1 = REGISTRY.filter((e) => inFilter(e, "p1"));
    expect(p1.every((e) => e.p1Scope)).toBe(true);
    const future = REGISTRY.filter((e) => inFilter(e, "future"));
    expect(future.every((e) => stateOf(e) === "Future")).toBe(true);
  });

  it("filters the checklist by kind", () => {
    const checklist = REGISTRY.filter((e) => inFilter(e, "checklist"));
    expect(checklist.length).toBeGreaterThan(0);
    expect(checklist.every((e) => e.kind === "checklist")).toBe(true);
  });
});

describe("owner-reported results", () => {
  it("records no commit for owner reports, because the tested build was not named", () => {
    expect(OWNER_REPORTS.length).toBeGreaterThan(0);
    expect(OWNER_REPORTS.every((r) => r.commit === null)).toBe(true);
  });

  it("does not turn an owner report into a Ready feature", () => {
    expect(summarise(REGISTRY).Ready).toBe(0);
  });
});
