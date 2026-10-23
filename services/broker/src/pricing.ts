/**
 * Model allowlist and price snapshot for the broker (Amendment 2026-10-20C C.2 and C.5).
 *
 * Prices are OpenRouter's public catalogue values read on 2026-10-24, stored as integer micro-USD per million
 * tokens so cost arithmetic stays exact. They are a snapshot: the owner re-verifies them before live use, and a
 * price change is a code change reviewed like any other. Models not in this list are refused.
 */
export interface ModelPrice {
  readonly id: string;
  /** Micro-USD per one million input tokens. 100000 means 0.10 USD per million. */
  readonly inputMicroUsdPerMillion: number;
  /** Micro-USD per one million output tokens. */
  readonly outputMicroUsdPerMillion: number;
  /** Largest context the broker will ever send to this model, in tokens. */
  readonly maxContextTokens: number;
  /** Whether the model accepts image input. Vision routes need an owner-measured image ceiling as well. */
  readonly acceptsImages: boolean;
  /** Which broker route may use this model: text routes or the vision route. */
  readonly feature: "text" | "vision";
}

export const MODEL_ALLOWLIST: readonly ModelPrice[] = [
  {
    id: "google/gemini-2.5-flash-lite",
    inputMicroUsdPerMillion: 100_000,
    outputMicroUsdPerMillion: 400_000,
    maxContextTokens: 1_048_576,
    acceptsImages: false,
    feature: "text",
  },
  {
    id: "google/gemini-2.5-flash",
    inputMicroUsdPerMillion: 300_000,
    outputMicroUsdPerMillion: 2_500_000,
    maxContextTokens: 1_048_576,
    acceptsImages: true,
    feature: "vision",
  },
];

export function findModel(id: string): ModelPrice | undefined {
  return MODEL_ALLOWLIST.find((model) => model.id === id);
}

/**
 * Worst-case cost of one provider attempt, in micro-USD. Each term is an upper bound:
 * - input tokens are bounded by the UTF-8 byte length of the request, because a token is at least one byte;
 * - a fixed allowance covers the provider's own chat template;
 * - output tokens are the caller's cap, which the broker has already clamped to its ceiling.
 */
export function worstCaseMicroUsd(
  model: ModelPrice,
  inputBoundTokens: number,
  maxOutputTokens: number,
): number {
  const inputTokens = inputBoundTokens;
  return (
    tokensToMicroUsd(inputTokens, model.inputMicroUsdPerMillion) +
    tokensToMicroUsd(maxOutputTokens, model.outputMicroUsdPerMillion)
  );
}

/** Cost of the tokens a provider reported, in micro-USD, rounded up. */
export function actualMicroUsd(
  model: ModelPrice,
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    tokensToMicroUsd(promptTokens, model.inputMicroUsdPerMillion) +
    tokensToMicroUsd(completionTokens, model.outputMicroUsdPerMillion)
  );
}

function tokensToMicroUsd(tokens: number, microUsdPerMillion: number): number {
  return Math.ceil((tokens * microUsdPerMillion) / 1_000_000);
}

/**
 * Converts micro-USD to paise, rounding up so the cap is never understated. `paisePerUsd` is the owner's
 * exchange-rate setting (BROKER_FX_PAISE_PER_USD). It is required and has no default.
 */
export function microUsdToPaise(microUsd: number, paisePerUsd: number): number {
  return Math.ceil((microUsd * paisePerUsd) / 1_000_000);
}
