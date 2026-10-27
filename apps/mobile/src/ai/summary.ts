import type { Lang } from "../ui/prefs";
import { askText, type AiAnswer } from "./assistant";

/** One line of the assistant conversation, as the summary sees it. */
export interface ChatLine {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** The newest lines only, so a long chat stays cheap to summarise. */
const MAX_LINES = 20;
/** Each line is cut to this length; the summary needs the gist, not every word. */
const MAX_CHARS = 600;

export const SUMMARY_RULE =
  "Summarise the conversation in the user message in 2-4 short sentences: what the user asked and the main answers. " +
  "Add no facts that are not in the conversation. Plain text, no lists.";

/** Thrown when there is no conversation to summarise yet. The screen shows a plain message, not an AI error. */
export class NothingToSummarise extends Error {
  constructor() {
    super("Nothing to summarise yet.");
    this.name = "NothingToSummarise";
  }
}

/** The transcript sent to the model: the newest lines, labelled, each cut to a safe length. Empty lines are dropped. */
export function transcriptOf(lines: readonly ChatLine[]): string {
  return lines
    .filter((line) => line.text.trim() !== "")
    .slice(-MAX_LINES)
    .map((line) => {
      const label = line.role === "user" ? "User" : "Assistant";
      return `${label}: ${line.text.trim().slice(0, MAX_CHARS)}`;
    })
    .join("\n");
}

/** A short summary of the chat in the reply language (F8). Runs only when the user asks for it. */
export function summariseConversation(
  lines: readonly ChatLine[],
  lang: Lang,
  external?: AbortSignal,
): Promise<AiAnswer> {
  const transcript = transcriptOf(lines);
  if (transcript === "") {
    return Promise.reject(new NothingToSummarise());
  }
  return askText([{ role: "user", content: transcript }], lang, SUMMARY_RULE, external);
}
