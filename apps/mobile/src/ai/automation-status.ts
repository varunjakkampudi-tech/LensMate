import { isDue, MAX_ATTEMPTS_PER_DAY, type Automation } from "./automations";

export type AutomationStatus = "ran-today" | "waiting" | "due" | "gave-up-today" | "disabled";

export function automationStatus(
  automation: Automation,
  day: string,
  clock: string,
): AutomationStatus {
  if (!automation.enabled) {
    return "disabled";
  }
  if (automation.lastRunDay === day) {
    return "ran-today";
  }
  if (automation.failedDay === day && (automation.failedCount ?? 0) >= MAX_ATTEMPTS_PER_DAY) {
    return "gave-up-today";
  }
  return isDue(automation, day, clock) ? "due" : "waiting";
}

export function automationStatusLabel(status: AutomationStatus, automation: Automation): string {
  switch (status) {
    case "ran-today":
      return "Ran today";
    case "waiting":
      return `Runs at ${automation.time}`;
    case "due":
      return "Will run when the app opens";
    case "gave-up-today":
      return automation.lastError === undefined
        ? `Stopped for today after ${MAX_ATTEMPTS_PER_DAY} failures`
        : `Stopped for today after ${MAX_ATTEMPTS_PER_DAY} failures: ${automation.lastError}`;
    case "disabled":
      return "Off";
  }
}
