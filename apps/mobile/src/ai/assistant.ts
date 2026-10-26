import { BrokerError } from "@lensmate/core";
import { BrokerCallBlocked, callBroker, callBrokerStream, callBrokerVision } from "../broker-call";
import { LANGS, type Lang, type Tone } from "../ui/prefs";

// Owner-approved allowlist (services/broker/src/pricing.ts). Zero-data-retention routing is set by the broker.
// Lowest-cost verified models with zero-data-retention endpoints. Must match services/broker/src/pricing.ts.
const TEXT_MODEL = "openai/gpt-4.1-nano";
const VISION_MODEL = "openai/gpt-4o-mini";

/** Thrown when live web research is requested. No verified research model exists yet, so it is not offered. */
class ResearchUnavailable extends Error {
  constructor() {
    super("Live internet research is not available in this version.");
    this.name = "ResearchUnavailable";
  }
}
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

/** Reading request for visible text. The model must copy the text exactly and mark anything it cannot read. */
export const READ_TEXT_REQUEST =
  "Read all the visible text in this image exactly as written, top to bottom and left to right. Keep the original wording, spelling and numbers. If a word is unclear, write [unclear] in its place instead of guessing. If there is no readable text, say that there is none.";

/**
 * Translate visible text (F9). The reply is already written in the user's chosen language, so the model reads the
 * text in whatever language it is, then gives it in that language. The same no-guessing marks apply.
 */
export const TRANSLATE_TEXT_REQUEST =
  "Read all the visible text in this image, in whatever language it is written. Then give it in the reply language, sentence by sentence, keeping names and numbers as written. If a word is unclear, write [unclear] in its place instead of guessing. If there is no readable text, say that there is none.";

const TONE_RULE: Record<Tone, string> = {
  warm: "Be warm and encouraging, like a kind friend.",
  brief: "Be very brief: one or two short sentences.",
  formal: "Be formal and precise. Use full sentences and no slang.",
};

/** The style instruction for the chosen tone. It is added to the system prompt; the safety rules above it still apply. */
export function toneInstruction(tone: Tone): string {
  return TONE_RULE[tone];
}

export const LANG_NAME = Object.fromEntries(
  Object.entries(LANGS).map(([k, v]) => [k, v.name]),
) as Record<Lang, string>;

/**
 * Thrown when the user cancels a request (Stop). It is not a provider or network failure, so callers must not show it
 * as an error or append an answer. The broker may still complete and charge the request: see docs/decisions/0004.
 */
export class RequestCancelled extends Error {
  constructor() {
    super("CANCELLED");
    this.name = "RequestCancelled";
  }
}

async function timed(
  route: LatencyRecord["route"],
  call: (
    signal: AbortSignal,
  ) => Promise<{ text: string; costPaise: number; source: "openrouter" | "mock" }>,
  external?: AbortSignal,
): Promise<AiAnswer> {
  if (external?.aborted) {
    throw new RequestCancelled();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onCancel = () => controller.abort();
  external?.addEventListener("abort", onCancel, { once: true });
  const started = Date.now();
  try {
    const reply = await call(controller.signal);
    if (external?.aborted) {
      throw new RequestCancelled();
    }
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
    if (external?.aborted) {
      throw new RequestCancelled();
    }
    record({ at: started, route, latencyMs: Date.now() - started, costPaise: 0, ok: false });
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onCancel);
  }
}

export type Turn = { readonly role: "user" | "assistant"; readonly content: string };

export function askText(
  history: readonly Turn[],
  lang: Lang,
  extraSystem = "",
  external?: AbortSignal,
): Promise<AiAnswer> {
  const system = `${RULES} Reply in ${LANG_NAME[lang]}. ${extraSystem}`.trim();
  return timed(
    "text",
    (signal) =>
      callBroker(
        {
          model: TEXT_MODEL,
          messages: [{ role: "system", content: system }, ...history.slice(-6)],
          maxOutputTokens: 400,
        },
        signal,
      ),
    external,
  );
}

/**
 * The text answer, streamed. onDelta receives each piece of text as it arrives. The same rules and model apply as
 * askText; only the delivery differs.
 */
export function askTextStreamed(
  history: readonly Turn[],
  lang: Lang,
  onDelta: (text: string) => void,
  extraSystem = "",
  external?: AbortSignal,
): Promise<AiAnswer> {
  const system = `${RULES} Reply in ${LANG_NAME[lang]}. ${extraSystem}`.trim();
  return timed(
    "text",
    (signal) =>
      callBrokerStream(
        {
          model: TEXT_MODEL,
          messages: [{ role: "system", content: system }, ...history.slice(-6)],
          maxOutputTokens: 400,
        },
        onDelta,
        signal,
      ),
    external,
  );
}

export function askVision(
  prompt: string,
  imageDataUrl: string,
  lang: Lang,
  detailed: boolean,
  external?: AbortSignal,
): Promise<AiAnswer> {
  const style = detailed
    ? "Describe in useful detail for someone who cannot see, most important first."
    : "";
  return timed(
    "vision",
    (signal) =>
      callBrokerVision(
        {
          model: VISION_MODEL,
          prompt: `${RULES} ${style} Reply in ${LANG_NAME[lang]}.\n\nUser request: ${prompt}`,
          imageDataUrl,
          maxOutputTokens: 450,
        },
        signal,
      ),
    external,
  );
}

/**
 * Live internet research. Not offered in this version: the only research model was the `:online` variant, whose
 * zero-data-retention compatibility is unverified, so the call is refused here without contacting the broker.
 */
export function research(
  _question: string,
  _lang: Lang,
  _external?: AbortSignal,
): Promise<AiAnswer> {
  return Promise.reject(new ResearchUnavailable());
}

/** Removes markdown emphasis and headings that some replies still contain. */
/** Cost line for a reply. A mock reply makes no provider call, so its figure is only an estimate, and it says so. */
export function costNote(source: "openrouter" | "mock", costPaise: number): string {
  const rupees = `₹${(costPaise / 100).toFixed(2)}`;
  return source === "mock" ? `Mock estimate ${rupees}, no provider call` : `Cost ${rupees}`;
}

export function plain(text: string): string {
  return text.replace(/\*\*|__|^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
}

export interface Translation {
  readonly translation: string;
  readonly uncertain: readonly string[];
  readonly answer: AiAnswer;
}

/** Text translation with uncertain-word marking (F20, F21). */
export async function translate(
  text: string,
  from: Lang,
  to: Lang,
  external?: AbortSignal,
): Promise<Translation> {
  const system =
    `Translate from ${LANG_NAME[from]} to ${LANG_NAME[to]}. Reply with JSON only: {"translation": string, "uncertain": string[]} ` +
    "where uncertain lists words of the translation you are not sure about (empty if none). Keep names as they are. No commentary.";
  const answer = await timed(
    "translate",
    (signal) =>
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
    external,
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
  NOT_CONFIGURED: "No AI service address is set in this build, so answers are mock responses.",
  LOOPBACK_ON_DEVICE:
    "This build's AI address points at this PC, which the phone cannot reach. Answers are mock responses until a secure address is set.",
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
  UNAUTHORIZED:
    "The AI service no longer accepts this phone. Remove its credential on the enrolment screen, then enrol again with a new code from the owner.",
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
