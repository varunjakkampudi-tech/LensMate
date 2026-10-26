import {
  clockOf,
  dayOf,
  isDue,
  MAX_ATTEMPTS_PER_DAY,
  withOutcome,
  type Automation,
} from "./automations";

const base: Automation = {
  id: "a1",
  name: "Briefing",
  time: "08:00",
  goal: "morning news",
  enabled: true,
};
const TODAY = "2026-10-26";

function first(list: readonly Automation[]): Automation {
  const a = list[0];
  if (a === undefined) {
    throw new Error("expected one automation");
  }
  return a;
}

describe("isDue", () => {
  it("is due once its time has come and it has not run today", () => {
    expect(isDue(base, TODAY, "08:00")).toBe(true);
    expect(isDue(base, TODAY, "07:59")).toBe(false);
    expect(isDue({ ...base, lastRunDay: TODAY }, TODAY, "09:00")).toBe(false);
    expect(isDue({ ...base, enabled: false }, TODAY, "09:00")).toBe(false);
  });

  it("is retried after a failure on the same day, until the daily attempts are used", () => {
    const once = withOutcome([base], "a1", TODAY, { ok: false, error: "offline" });
    expect(isDue(first(once), TODAY, "09:00")).toBe(true);
    let list: Automation[] = [base];
    for (let i = 0; i < MAX_ATTEMPTS_PER_DAY; i += 1) {
      list = withOutcome(list, "a1", TODAY, { ok: false, error: "offline" });
    }
    expect(isDue(first(list), TODAY, "09:00")).toBe(false);
  });

  it("is due again the next day after a failure", () => {
    const failed = withOutcome([base], "a1", TODAY, { ok: false, error: "offline" });
    expect(isDue(first(failed), "2026-10-27", "09:00")).toBe(true);
  });
});

describe("withOutcome", () => {
  it("does not mark a failed run as done for the day", () => {
    const [failed] = withOutcome([base], "a1", TODAY, { ok: false, error: "offline" });
    expect(failed?.lastRunDay).toBeUndefined();
    expect(failed?.failedCount).toBe(1);
    expect(failed?.lastError).toBe("offline");
  });

  it("clears the failure record after a success", () => {
    const failed = withOutcome([base], "a1", TODAY, { ok: false, error: "offline" });
    const [done] = withOutcome(failed, "a1", TODAY, { ok: true });
    expect(done?.lastRunDay).toBe(TODAY);
    expect(done?.failedCount).toBeUndefined();
    expect(done?.lastError).toBeUndefined();
  });

  it("leaves other automations alone", () => {
    const other: Automation = { ...base, id: "a2" };
    const list = withOutcome([base, other], "a1", TODAY, { ok: true });
    expect(list[1]).toBe(other);
  });
});

describe("clock helpers", () => {
  it("formats the local day and time", () => {
    const now = new Date(2026, 9, 26, 7, 5);
    expect(dayOf(now)).toBe("2026-10-26");
    expect(clockOf(now)).toBe("07:05");
  });
});
