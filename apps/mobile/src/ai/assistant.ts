import { BrokerError } from "@lensmate/core";
import { BrokerCallBlocked, callBroker, callBrokerVision } from "../broker-call";
import { LANGS, type Lang } from "../ui/prefs";

// Owner-approved allowlist (services/broker/src/pricing.ts). Zero-data-retention routing is set by the broker.
const TEXT_MODEL = "google/gemini-3.1-flash-lite";
const VISION_MODEL = "google/gemini-3.5-flash-lite";
const RESEARCH_MODEL = "google/gemini-3.1-flash-lite:online";
const TIMEOUT_MS = 30_000;

export interface AiAnswer {
  readonly text: string;
  readonly costPaise: number;
  readonly latencyMs: number;
  readonly source: "openrouter" | "mock";
}

export interface LatencyRecord {
  readonly at: number;
  readonly route: "text" | "vision" | "translate" | "research";
  readonly latencyMs: number;
  readonly costPaise: number;
  readonly ok: boolean;
}

const LOG_LIMIT = 200;
const log: LatencyRecord[] = [];

/** The most recent calls, newest first. Kept in memory only, for the diagnostics screen. */
export function latencyLog(): readonly LatencyRecord[] {
  return log;
}

function record(entry: LatencyRecord): void {
  log.unshift(entry);
  log.splice(LOG_LIMIT);
}

const RULES =
  "You are LensMate, a warm, friendly assistant inside smart glasses. Talk like a natural person speaking aloud: short sentences, everyday words, contractions, no lists or headings unless asked, at most 4 sentences unless asked. Understand the user in any language or mix of languages. " +
  "Say clearly when you are unsure and why. Never identify people or guess who someone is. " +
  "Never say a road, path or crossing is safe, clear or that the user can go; describe what you see and advise caution instead. " +
  "Give information, not instructions for dangerous tasks. Plain text only, no markdown.";

export const LANG_NAME = Object.fromEntries(
  Object.entries(LANGS).map(([k, v]) => [k, v.name]),
) as Record<Lang, string>;

async function timed(
  route: LatencyRecord["route"],
  call: (
    signal: AbortSignal,
  ) => Promise<{ text: string; costPaise: number; source: "openrouter" | "mock" }>,
): Promise<AiAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const reply = await call(controller.signal);
    const answer = {
      text: plain(reply.text.trim()),
      costPaise: reply.costPaise,
      source: reply.source,
      latencyMs: Date.now() - started,
    };
    record({
      at: started,
      route,
      latencyMs: answer.latencyMs,
      costPaise: answer.costPaise,
      ok: true,
    });
    return answer;
  } catch (error) {
    record({ at: started, route, latencyMs: Date.now() - started, costPaise: 0, ok: false });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type Turn = { readonly role: "user" | "assistant"; readonly content: string };

export function askText(history: readonly Turn[], lang: Lang, extraSystem = ""): Promise<AiAnswer> {
  const system = `${RULES} Reply in ${LANG_NAME[lang]}. ${extraSystem}`.trim();
  return timed("text", (signal) =>
    callBroker(
      {
        model: TEXT_MODEL,
        messages: [{ role: "system", content: system }, ...history.slice(-6)],
        maxOutputTokens: 400,
      },
      signal,
    ),
  );
}

export function askVision(
  prompt: string,
  imageDataUrl: string,
  lang: Lang,
  detailed: boolean,
): Promise<AiAnswer> {
  const style = detailed
    ? "Describe in useful detail for someone who cannot see, most important first."
    : "";
  return timed("vision", (signal) =>
    callBrokerVision(
      {
        model: VISION_MODEL,
        prompt: `${RULES} ${style} Reply in ${LANG_NAME[lang]}.\n\nUser request: ${prompt}`,
        imageDataUrl,
        maxOutputTokens: 450,
      },
      signal,
    ),
  );
}

/** Live internet research (OpenRouter web search, zero data retention). The broker charges the worst case per call. */
export function research(question: string, lang: Lang): Promise<AiAnswer> {
  return timed("research", (signal) =>
    callBroker(
      {
        model: RESEARCH_MODEL,
        messages: [
          {
            role: "system",
            content: `${RULES} Use current web results. End with up to 3 short source names or domains. Reply in ${LANG_NAME[lang]}.`,
          },
          { role: "user", content: question },
        ],
        maxOutputTokens: 350,
      },
      signal,
    ),
  );
}

/** Removes markdown emphasis and headings that some replies still contain. */
export function plain(text: string): string {
  return text.replace(/\*\*|__|^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
}

export interface Translation {
  readonly translation: string;
  readonly uncertain: readonly string[];
  readonly answer: AiAnswer;
}

/** Text translation with uncertain-word marking (F20, F21). */
export async function translate(text: string, from: Lang, to: Lang): Promise<Translation> {
  const system =
    `Translate from ${LANG_NAME[from]} to ${LANG_NAME[to]}. Reply with JSON only: {"translation": string, "uncertain": string[]} ` +
    "where uncertain lists words of the translation you are not sure about (empty if none). Keep names as they are. No commentary.";
  const answer = await timed("translate", (signal) =>
    callBroker(
      {
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
        maxOutputTokens: 300,
      },
      signal,
    ),
  );
  const match = /\{[\s\S]*\}/.exec(answer.text);
  try {
    const parsed = JSON.parse(match?.[0] ?? "") as { translation?: unknown; uncertain?: unknown };
    if (typeof parsed.translation === "string") {
      const uncertain = Array.isArray(parsed.uncertain)
        ? parsed.uncertain.filter((w): w is string => typeof w === "string")
        : [];
      return { translation: parsed.translation, uncertain, answer };
    }
  } catch {
    // Not JSON: the whole reply is shown and marked uncertain below.
  }
  return { translation: answer.text, uncertain: [answer.text], answer };
}

const BLOCKED: Record<string, string> = {
  NOT_CONFIGURED: "The AI service address is not set in this build.",
  CONFIG_INVALID: "The AI service address in this build is invalid.",
  NOT_ENROLLED: "Enrol this phone first (Home → More tools → Enrol this phone).",
  CREDENTIAL_INVALID: "This phone's credential is damaged. Ask the owner to enrol it again.",
  DISCLOSURE_NOT_APPROVED: "Cloud AI is not approved for this build.",
  DISCLOSURE_REQUIRED: "Read and accept the cloud notice first (Home → Set up AI).",
  STORAGE_UNAVAILABLE: "Secure storage is unavailable on this device.",
};

const REFUSED: Record<string, string> = {
  BUDGET_EXHAUSTED: "The monthly AI spending cap is reached. AI answers resume next month.",
  QUOTA_EXCEEDED: "Today's request quota for this phone is used up.",
  RATE_LIMITED: "Too many requests at once. Wait a moment and try again.",
  BUSY: "The AI service is busy. Try again in a moment.",
  TIMEOUT: "The AI took too long and was stopped. Try again.",
  UNAUTHORIZED: "The AI service no longer accepts this phone. Ask the owner to enrol it again.",
  NETWORK: "No connection to the AI service.",
  IMAGE_REJECTED: "The photo was refused (too large or not a JPEG or PNG).",
  FEATURE_UNAVAILABLE: "Vision is switched off on the AI service.",
};

export function aiErrorText(error: unknown): string {
  if (error instanceof BrokerCallBlocked) {
    return BLOCKED[error.reason] ?? "AI is not available yet.";
  }
  if (error instanceof BrokerError) {
    return REFUSED[error.code] ?? "The AI service could not answer. Try again.";
  }
  return "Something went wrong. Try again.";
}
