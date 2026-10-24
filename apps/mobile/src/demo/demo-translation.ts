import { DEMO } from "./demo-strings";

/**
 * The MOCK translation for the demo. It is a fixed phrase table, with a word table as the fallback for a phrase
 * that is not in the table. It is not a translation service, makes no network call, and claims no accuracy.
 * A word that is not in the word table is marked "unsure", as the spec requires for uncertain words (5.3).
 */

type TranslationLanguage = "TELUGU" | "HINDI";

interface TranslationLine {
  readonly language: TranslationLanguage;
  readonly text: string;
}

export interface TranslationResult {
  /** The synthetic English phrase that was translated. */
  readonly english: string;
  /** PHRASE_TABLE when the whole phrase is in the fixed table; WORD_TABLE when words were looked up one by one. */
  readonly source: "PHRASE_TABLE" | "WORD_TABLE";
  /** The English words that were not in the word table, in order. Each one is marked unsure in the lines. */
  readonly unsureWords: readonly string[];
  readonly lines: readonly TranslationLine[];
}

/** Lower-case words of an English phrase, with punctuation removed and single spaces between words. */
export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" ");
}

function entryFor<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.entries(table).find(([candidate]) => candidate === key)?.[1];
}

/** Translates a synthetic English phrase from the fixed tables. Never calls a service. */
export function translateTranscript(english: string): TranslationResult {
  const key = normalizePhrase(english);
  const fixed = entryFor(DEMO.translation.phraseTable, key);
  if (fixed !== undefined) {
    return {
      english,
      source: "PHRASE_TABLE",
      unsureWords: [],
      lines: [
        { language: "TELUGU", text: fixed.telugu },
        { language: "HINDI", text: fixed.hindi },
      ],
    };
  }

  const unsureWords: string[] = [];
  const telugu: string[] = [];
  const hindi: string[] = [];
  for (const word of key === "" ? [] : key.split(" ")) {
    const entry = entryFor(DEMO.translation.wordTable, word);
    if (entry === undefined) {
      unsureWords.push(word);
      const marked = `${word} (${DEMO.translation.unsure})`;
      telugu.push(marked);
      hindi.push(marked);
    } else {
      telugu.push(entry.telugu);
      hindi.push(entry.hindi);
    }
  }
  return {
    english,
    source: "WORD_TABLE",
    unsureWords,
    lines: [
      { language: "TELUGU", text: telugu.join(" ") },
      { language: "HINDI", text: hindi.join(" ") },
    ],
  };
}

/** The countdown text, rounded up to whole seconds, as minutes and seconds (for example 2:00, then 0:01). */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}
