import type { Lang } from "../ui/prefs";

/** One exchange in a two-way conversation: what was heard, and its translation. */
export interface ConversationTurn {
  readonly id: number;
  readonly heard: string;
  readonly from: Lang;
  readonly translated: string;
  readonly to: Lang;
  /** Words of the translation the model was not sure about. */
  readonly uncertain: readonly string[];
}

/** The most turns kept on screen. Older turns are dropped, so the transcript stays small. */
export const MAX_TURNS = 50;

/**
 * After a turn, the other person speaks next. The speaker swaps between the two languages, so the next speech is in
 * the other language. With the same language on both sides there is nothing to swap, and the speaker stays.
 */
export function handOver(speaker: Lang, first: Lang, second: Lang): Lang {
  if (first === second) {
    return speaker;
  }
  return speaker === first ? second : first;
}

/** Adds a turn at the end of the transcript and keeps only the most recent MAX_TURNS. */
export function appendTurn(
  turns: readonly ConversationTurn[],
  turn: ConversationTurn,
): ConversationTurn[] {
  const next = [...turns, turn];
  return next.length > MAX_TURNS ? next.slice(next.length - MAX_TURNS) : next;
}
