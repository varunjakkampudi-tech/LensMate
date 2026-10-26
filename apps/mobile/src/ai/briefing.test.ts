import { buildBriefing, routinesLeftToday, type BriefingRoutine } from "./briefing";

const DAY = "2026-10-26";

describe("routinesLeftToday", () => {
  it("keeps enabled routines that have not run today, in time order", () => {
    const routines: BriefingRoutine[] = [
      { name: "Evening news", enabled: true, time: "18:00" },
      { name: "Off", enabled: false, time: "07:00" },
      { name: "Morning", enabled: true, time: "08:00", lastRunDay: DAY },
      { name: "Lunch note", enabled: true, time: "13:00" },
      { name: "Earlier", enabled: true, time: "06:00" },
    ];
    expect(routinesLeftToday(routines, DAY, "09:00").map((r) => r.name)).toEqual([
      "Lunch note",
      "Evening news",
    ]);
  });

  it("re-includes a routine that ran yesterday", () => {
    const yesterday: BriefingRoutine = {
      name: "Briefing",
      enabled: true,
      time: "08:00",
      lastRunDay: "2026-10-25",
    };
    expect(routinesLeftToday([yesterday], DAY, "07:00")).toHaveLength(1);
  });
});

describe("buildBriefing", () => {
  it("says so when nothing is left", () => {
    const b = buildBriefing({ routines: [], reminders: [], day: DAY, clock: "09:00" });
    expect(b.lines).toEqual([]);
    expect(b.spoken).toBe("Nothing is left on your list for today.");
  });

  it("lists routines and open reminders, and skips finished reminders", () => {
    const b = buildBriefing({
      routines: [{ name: "Evening news", enabled: true, time: "18:00" }],
      reminders: [
        { title: "Collect the prescription" },
        { title: "Old task", done: true },
        { title: "Call the bank", done: false },
      ],
      day: DAY,
      clock: "09:00",
    });
    expect(b.lines).toEqual([
      "You have 3 things for today.",
      "At 18:00, your routine Evening news runs.",
      "Reminder: Collect the prescription.",
      "Reminder: Call the bank.",
    ]);
    expect(b.spoken).toBe(b.lines.join(" "));
  });

  it("uses the singular for one thing", () => {
    const b = buildBriefing({
      routines: [],
      reminders: [{ title: "Umbrella" }],
      day: DAY,
      clock: "09:00",
    });
    expect(b.lines[0]).toBe("You have 1 thing for today.");
  });
});
