import { Platform } from "react-native";
import { runAgentTask } from "./agent";
import { saveItem } from "../memory/vault";

/**
 * User-created automations (proactive help without cameras or microphones). They run only while the app is open, at
 * most once a day after a success, and up to MAX_ATTEMPTS_PER_DAY times a day after failures. Every run goes through
 * the broker's spend cap. Nothing runs while the app is closed: that needs a native background scheduler, which is
 * not built.
 */
export interface Automation {
  readonly id: string;
  readonly name: string;
  /** Local time "HH:MM". */
  readonly time: string;
  readonly goal: string;
  readonly enabled: boolean;
  /** The day of the last successful run. */
  readonly lastRunDay?: string;
  /** The day of the most recent failure, and how many times it failed that day. */
  readonly failedDay?: string;
  readonly failedCount?: number;
  readonly lastError?: string;
}

export type RunOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

export const MAX_ATTEMPTS_PER_DAY = 3;
/** Automations run at most this many per app open, so a long list cannot spend the budget in one go. */
const MAX_RUNS_PER_OPEN = 5;

const KEY = "lensmate.automations.v1";
let running = false;

export function loadAutomations(): Automation[] {
  if (Platform.OS !== "web") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Automation[]) : [];
  } catch {
    return [];
  }
}

export function saveAutomations(list: readonly Automation[]): void {
  if (Platform.OS === "web") {
    globalThis.localStorage.setItem(KEY, JSON.stringify(list));
  }
}

/** Today's date in the user's local time zone, the same clock that sets each automation's time. */
export function dayOf(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Local time "HH:MM" for a moment, comparable with an automation's time. */
export function clockOf(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** True when the automation should run now: enabled, its time has come, and it has neither finished nor given up today. */
export function isDue(a: Automation, day: string, clock: string): boolean {
  if (!a.enabled || a.lastRunDay === day || a.time > clock) {
    return false;
  }
  const failedToday = a.failedDay === day ? (a.failedCount ?? 0) : 0;
  return failedToday < MAX_ATTEMPTS_PER_DAY;
}

/** The list with one automation's outcome recorded. A success clears the failure record; a failure is counted for the day. */
export function withOutcome(
  list: readonly Automation[],
  id: string,
  day: string,
  outcome: RunOutcome,
): Automation[] {
  return list.map((a) => {
    if (a.id !== id) {
      return a;
    }
    if (outcome.ok) {
      return {
        ...a,
        lastRunDay: day,
        failedDay: undefined,
        failedCount: undefined,
        lastError: undefined,
      };
    }
    const priorToday = a.failedDay === day ? (a.failedCount ?? 0) : 0;
    return {
      ...a,
      failedDay: day,
      failedCount: priorToday + 1,
      lastError: outcome.error.slice(0, 120),
    };
  });
}

function recordOutcome(id: string, day: string, outcome: RunOutcome): void {
  saveAutomations(withOutcome(loadAutomations(), id, day, outcome));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/** Runs one automation now and records the outcome. A failure is recorded and rethrown, so the caller can show it. */
export async function runAutomation(a: Automation): Promise<string> {
  const day = dayOf(new Date());
  try {
    const result = await runAgentTask(a.goal, "en", () => undefined);
    await saveItem({ kind: "answer", title: `Automation: ${a.name}`, text: result.answer });
    recordOutcome(a.id, day, { ok: true });
    return result.answer;
  } catch (error) {
    recordOutcome(a.id, day, { ok: false, error: describeError(error) });
    throw error;
  }
}

/**
 * Runs the automations that are due when the app opens. A failure is retried on a later open, up to the daily limit.
 * The user is told only when an automation has used up its attempts for the day.
 */
export async function runDueAutomations(
  notify: (title: string, body: string) => void,
): Promise<void> {
  if (running) {
    return;
  }
  const now = new Date();
  const day = dayOf(now);
  const clock = clockOf(now);
  const due = loadAutomations()
    .filter((a) => isDue(a, day, clock))
    .slice(0, MAX_RUNS_PER_OPEN);
  if (due.length === 0) {
    return;
  }
  running = true;
  try {
    for (const a of due) {
      try {
        notify(`LensMate: ${a.name}`, (await runAutomation(a)).slice(0, 180));
      } catch (error) {
        const after = loadAutomations().find((x) => x.id === a.id);
        if (after !== undefined && !isDue(after, day, clock)) {
          notify(`LensMate: ${a.name} did not run`, describeError(error).slice(0, 180));
        }
      }
    }
  } finally {
    running = false;
  }
}
