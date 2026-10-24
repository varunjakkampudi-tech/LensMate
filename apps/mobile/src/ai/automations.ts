import { Platform } from "react-native";
import { runAgentTask } from "./agent";
import { saveItem } from "../memory/vault";

/**
 * User-created automations (proactive help without cameras or microphones). They run only while the app is open,
 * at most once per day each, and every run goes through the broker's spend cap.
 */
export interface Automation {
  readonly id: string;
  readonly name: string;
  /** Local time "HH:MM". */
  readonly time: string;
  readonly goal: string;
  readonly enabled: boolean;
  readonly lastRunDay?: string;
}

const KEY = "lensmate.automations.v1";
let running = false;

export function loadAutomations(): Automation[] {
  if (Platform.OS !== "web") {
    return [];
  }
  try {
    return JSON.parse(globalThis.localStorage.getItem(KEY) ?? "[]") as Automation[];
  } catch {
    return [];
  }
}

export function saveAutomations(list: readonly Automation[]): void {
  if (Platform.OS === "web") {
    globalThis.localStorage.setItem(KEY, JSON.stringify(list));
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export async function runAutomation(a: Automation): Promise<string> {
  const result = await runAgentTask(a.goal, "en", () => undefined);
  await saveItem({ kind: "answer", title: `Automation: ${a.name}`, text: result.answer });
  saveAutomations(
    loadAutomations().map((x) => (x.id === a.id ? { ...x, lastRunDay: today() } : x)),
  );
  return result.answer;
}

export async function runDueAutomations(
  notify: (title: string, body: string) => void,
): Promise<void> {
  if (running) {
    return;
  }
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const due = loadAutomations().find(
    (a) => a.enabled && a.lastRunDay !== today() && a.time <= hhmm,
  );
  if (due === undefined) {
    return;
  }
  running = true;
  try {
    notify(`LensMate: ${due.name}`, (await runAutomation(due)).slice(0, 180));
  } catch {
    saveAutomations(
      loadAutomations().map((x) => (x.id === due.id ? { ...x, lastRunDay: today() } : x)),
    );
  } finally {
    running = false;
  }
}
