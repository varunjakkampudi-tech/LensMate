/**
 * Today's briefing: the routines still to run today and the open reminders, in plain sentences the assistant can read
 * aloud. Pure, so the wording and the rules can be tested without a device. It runs nothing and changes nothing.
 */
export interface BriefingRoutine {
  readonly name: string;
  readonly enabled: boolean;
  /** Local time "HH:MM". */
  readonly time: string;
  readonly lastRunDay?: string;
}

export interface BriefingReminder {
  readonly title: string;
  readonly done?: boolean;
  readonly dueAt?: number;
}

export interface Briefing {
  readonly lines: readonly string[];
  /** The same content as one spoken paragraph. */
  readonly spoken: string;
}

/** Routines still to run today, in time order. A routine that already ran today is left out. */
export function routinesLeftToday(
  routines: readonly BriefingRoutine[],
  day: string,
  clock: string,
): BriefingRoutine[] {
  return routines
    .filter((r) => r.enabled && r.lastRunDay !== day && r.time >= clock)
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export function buildBriefing(input: {
  readonly routines: readonly BriefingRoutine[];
  readonly reminders: readonly BriefingReminder[];
  readonly day: string;
  readonly clock: string;
}): Briefing {
  const lines: string[] = [];
  const left = routinesLeftToday(input.routines, input.day, input.clock);
  for (const r of left) {
    lines.push(`At ${r.time}, your routine ${r.name} runs.`);
  }
  const open = input.reminders.filter((r) => r.done !== true);
  for (const r of open) {
    lines.push(`Reminder: ${r.title}.`);
  }
  if (lines.length === 0) {
    return { lines: [], spoken: "Nothing is left on your list for today." };
  }
  const intro = `You have ${lines.length} ${lines.length === 1 ? "thing" : "things"} for today.`;
  return { lines: [intro, ...lines], spoken: [intro, ...lines].join(" ") };
}
