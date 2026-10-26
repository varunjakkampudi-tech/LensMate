import type { LiveState } from "../vision/live-session";
import type { SeeAnswer } from "./session";

export interface Answer {
  readonly title: string;
  readonly text: string;
  readonly followups: readonly string[];
  readonly meta: string;
}

/** The instruction that asks the model for the structured reply the Photo & Ask screen shows. */
export const FORMAT =
  'Reply with JSON only: {"title": short name of the main subject, "answer": 2-4 sentences, "followups": [3 short follow-up questions the user may ask next]}.';

export interface Parsed {
  readonly title: string;
  readonly text: string;
  readonly followups: readonly string[];
}

/**
 * Reads the model's reply. Valid JSON gives a title, an answer and up to three follow-ups. Anything else is shown as the
 * whole reply, so no answer is lost because the model did not follow the format.
 */
export function parse(raw: string): Parsed {
  try {
    const j = JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? "") as {
      title?: unknown;
      answer?: unknown;
      followups?: unknown;
    };
    return {
      title: typeof j.title === "string" ? j.title : "Answer",
      text: typeof j.answer === "string" ? j.answer : raw,
      followups: Array.isArray(j.followups)
        ? j.followups.filter((f): f is string => typeof f === "string").slice(0, 3)
        : [],
    };
  } catch {
    return { title: "Answer", text: raw, followups: [] };
  }
}

/** "MOCK" is shown whenever no AI provider was paid for this answer. */
export function metaOf(a: SeeAnswer): string {
  return `${a.source === "mock" ? "MOCK · " : ""}${(a.latencyMs / 1000).toFixed(1)} s · ₹${(a.costPaise / 100).toFixed(2)}`;
}

/** One plain line for the Live Vision panel. It says what is happening and why it stopped. */
export function liveStatusText(state: LiveState): string {
  switch (state.phase) {
    case "idle":
      return "Not running. The camera sends nothing until you press Start.";
    case "running":
      return `Running. ${state.framesAnalysed} analysed, ${state.invalidFrames} unusable frames skipped.`;
    case "stopped":
      return state.message ?? "Stopped. No more frames are sent.";
    case "budget_reached":
    case "timed_out":
    case "error":
      return state.message ?? "Stopped.";
  }
}
