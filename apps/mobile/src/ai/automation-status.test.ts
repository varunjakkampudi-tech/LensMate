import { automationStatus, automationStatusLabel } from "./automation-status";
import type { Automation } from "./automations";

const DAY = "2026-10-26";
const CLOCK = "10:15";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "test",
    name: "Morning briefing",
    time: "08:00",
    goal: "Summarize saved notes",
    enabled: true,
    ...overrides,
  };
}

describe("automationStatus", () => {
  it("reports a successful run today", () => {
    const item = automation({ lastRunDay: DAY });
    const status = automationStatus(item, DAY, CLOCK);
    expect(status).toBe("ran-today");
    expect(automationStatusLabel(status, item)).toBe("Ran today");
  });

  it("reports an automation that has not reached its time", () => {
    const item = automation({ time: "11:00" });
    const status = automationStatus(item, DAY, CLOCK);
    expect(status).toBe("waiting");
    expect(automationStatusLabel(status, item)).toBe("Runs at 11:00");
  });

  it("reports an automation due on app open", () => {
    const item = automation();
    const status = automationStatus(item, DAY, CLOCK);
    expect(status).toBe("due");
    expect(automationStatusLabel(status, item)).toBe("Will run when the app opens");
  });

  it("reports an automation that reached its daily failure limit", () => {
    const item = automation({
      failedDay: DAY,
      failedCount: 3,
      lastError: "Network unavailable",
    });
    const status = automationStatus(item, DAY, CLOCK);
    expect(status).toBe("gave-up-today");
    expect(automationStatusLabel(status, item)).toBe(
      "Stopped for today after 3 failures: Network unavailable",
    );
    expect(item.lastError).toBe("Network unavailable");
  });

  it("reports a disabled automation", () => {
    const item = automation({ enabled: false });
    const status = automationStatus(item, DAY, CLOCK);
    expect(status).toBe("disabled");
    expect(automationStatusLabel(status, item)).toBe("Off");
  });
});
