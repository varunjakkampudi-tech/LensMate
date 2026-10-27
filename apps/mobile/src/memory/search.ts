import type { MemoryItem } from "./vault";

/** Question words that carry no meaning for matching notes. */
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "what",
  "where",
  "when",
  "which",
  "that",
  "this",
  "have",
  "did",
  "does",
  "are",
  "was",
  "were",
  "you",
  "your",
  "tell",
  "about",
  "from",
  "into",
]);

/** Lower-case words of a question, without punctuation and without the common question words. */
export function questionWords(question: string): string[] {
  return (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => word.length > 2 && !STOP_WORDS.has(word),
  );
}

/** A note matches a word when the word's stem appears in it, so "parked" finds "park". */
function matchesWord(word: string, haystack: string): boolean {
  const stem = word.length >= 5 ? word.slice(0, word.length - 2) : word;
  return haystack.includes(stem);
}

/**
 * The notes to give the model as context for a question. Notes that match a question word come first.
 */
export function relevantNotes(
  items: readonly MemoryItem[],
  question: string,
  limit: number,
  options: { fallbackToNewest?: boolean } = {},
): MemoryItem[] {
  const words = questionWords(question);
  const matched = items.filter((item) => {
    const haystack = `${item.title} ${item.text}`.toLowerCase();
    return words.some((word) => matchesWord(word, haystack));
  });
  return (matched.length > 0 ? matched : options.fallbackToNewest === true ? [...items] : []).slice(
    0,
    limit,
  );
}
