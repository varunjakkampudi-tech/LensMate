/**
 * The JARVIS status board on the home screen. Pure: it turns what the app knows into rows the screen can show, so the
 * wording and the on/off rules can be tested without a device. Nothing here starts the camera or the microphone.
 */
type HudTone = "on" | "off" | "ready" | "warn";

export interface HudRow {
  readonly key: "camera" | "microphone" | "memory" | "automations" | "brain";
  readonly label: string;
  readonly value: string;
  readonly tone: HudTone;
}

/** The fields the board needs from an automation. Structural, so this file does not depend on the automation store. */
export interface HudAutomation {
  readonly enabled: boolean;
  /** Local time "HH:MM". */
  readonly time: string;
  readonly lastRunDay?: string;
}

export interface HudInput {
  /** True only while the See screen has its camera open. The home screen is never live. */
  readonly cameraLive: boolean;
  /** Whether this browser or phone can listen for speech at all. */
  readonly micAvailable: boolean;
  readonly memoryCount: number;
  readonly automations: readonly HudAutomation[];
  readonly aiReady: boolean;
  /** Local day "YYYY-MM-DD" and time "HH:MM" for the "next due" wording. */
  readonly day: string;
  readonly clock: string;
}

/** The next enabled automation still to run today, or null when none is left. */
export function nextDue(
  automations: readonly HudAutomation[],
  day: string,
  clock: string,
): HudAutomation | null {
  const later = automations
    .filter((a) => a.enabled && a.lastRunDay !== day && a.time >= clock)
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return later[0] ?? null;
}

export function hudRows(input: HudInput): HudRow[] {
  const enabled = input.automations.filter((a) => a.enabled).length;
  const next = nextDue(input.automations, input.day, input.clock);
  return [
    {
      key: "camera",
      label: "Camera",
      value: input.cameraLive ? "On · the preview is live" : "Off · runs only while See is open",
      tone: input.cameraLive ? "on" : "off",
    },
    {
      key: "microphone",
      label: "Microphone",
      value: input.micAvailable
        ? "Off · tap Hear & Talk to speak"
        : "Not available in this browser · type instead",
      tone: input.micAvailable ? "off" : "warn",
    },
    {
      key: "memory",
      label: "Memory",
      value: `${input.memoryCount} saved ${input.memoryCount === 1 ? "item" : "items"} · encrypted on this phone`,
      tone: "ready",
    },
    {
      key: "automations",
      label: "Routines",
      value:
        enabled === 0
          ? "None set"
          : next === null
            ? `${enabled} on · nothing left to run today`
            : `${enabled} on · next at ${next.time}`,
      tone: enabled === 0 ? "off" : "ready",
    },
    {
      key: "brain",
      label: "AI",
      value: input.aiReady ? "Ready · answers need your confirmation to act" : "Setup needed",
      tone: input.aiReady ? "ready" : "warn",
    },
  ];
}
