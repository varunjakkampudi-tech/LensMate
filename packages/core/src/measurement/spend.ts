/**
 * Spend calculator (label: CALCULATED, not MEASURED).
 *
 * Pure arithmetic. It never calls a provider, reads no environment variable and assumes nothing: prices, token
 * counts, request volumes, the cap and the exchange rate all come from the caller. A projection is refused when the
 * exchange rate is missing (BROKER_FX_PAISE_PER_USD has no default), when a request type has no price, or when an
 * input is not a valid number. Money is integer micro-USD and integer paise; rounding is upward, as in the broker.
 */

/** One price row from an approved snapshot. Micro-USD per one million tokens, so 100000 means 0.10 USD. */
export interface PriceEntry {
  readonly requestType: string;
  readonly model: string;
  readonly inputMicroUsdPerMillion: number;
  readonly outputMicroUsdPerMillion: number;
}

/** An assumed workload for one request type. Assumptions, not measurements: the caller states each one. */
export interface RequestAssumption {
  readonly requestType: string;
  readonly inputTokensPerRequest: number;
  readonly outputTokensPerRequest: number;
  readonly requestsPerMonth: number;
}

export interface SpendCalculationInput {
  readonly priceSnapshot: readonly PriceEntry[];
  /** Where the snapshot came from, for example a document section and its read date. Required. */
  readonly priceSnapshotSource: string;
  readonly requests: readonly RequestAssumption[];
  readonly capPaise: number;
  /** BROKER_FX_PAISE_PER_USD. Required: pass undefined or null and the projection is refused. */
  readonly paisePerUsd: number | null | undefined;
}

export interface PerRequestCost {
  readonly requestType: string;
  readonly model: string;
  readonly microUsd: number;
  readonly paise: number;
}

export type SpendCalculation =
  | {
      readonly status: "refused";
      readonly reason: "EXCHANGE_RATE_MISSING" | "INVALID_INPUT";
      readonly problems: readonly string[];
    }
  | {
      readonly status: "calculated";
      readonly label: "CALCULATED";
      readonly notMeasured: true;
      readonly priceSnapshotSource: string;
      readonly perRequest: readonly PerRequestCost[];
      readonly monthlyMicroUsd: number;
      readonly monthlyPaise: number;
      readonly capPaise: number;
      /** True when the projected month is at or under the cap. */
      readonly withinCap: boolean;
      /** Cap minus projected month. Negative when the projection is over the cap. */
      readonly headroomPaise: number;
    };

/** Computes cost per request type and the projected month against the cap. Never throws on bad input. */
export function calculateSpend(input: SpendCalculationInput): SpendCalculation {
  const problems: string[] = [];

  const paisePerUsd = input.paisePerUsd;
  if (paisePerUsd === undefined || paisePerUsd === null) {
    return {
      status: "refused",
      reason: "EXCHANGE_RATE_MISSING",
      problems: [
        "paisePerUsd (BROKER_FX_PAISE_PER_USD) must be given explicitly; there is no default",
      ],
    };
  }
  if (!isPositiveSafeInteger(paisePerUsd)) {
    problems.push("paisePerUsd must be a positive whole number of paise per USD");
  }
  if (!isNonNegativeSafeInteger(input.capPaise)) {
    problems.push("capPaise must be a non-negative whole number of paise");
  }
  if (input.priceSnapshotSource.trim() === "") {
    problems.push("priceSnapshotSource must name the document the prices came from");
  }
  if (input.requests.length === 0) {
    problems.push("at least one request type is needed; an empty projection is not computed");
  }

  const prices = new Map<string, PriceEntry>();
  for (const price of input.priceSnapshot) {
    if (prices.has(price.requestType)) {
      problems.push(`price snapshot lists request type ${price.requestType} more than once`);
    }
    prices.set(price.requestType, price);
    if (
      !isNonNegativeSafeInteger(price.inputMicroUsdPerMillion) ||
      !isNonNegativeSafeInteger(price.outputMicroUsdPerMillion)
    ) {
      problems.push(`price for ${price.requestType} must be non-negative whole micro-USD`);
    }
  }

  const perRequest: PerRequestCost[] = [];
  let monthlyMicroUsd = 0;
  for (const request of input.requests) {
    const price = prices.get(request.requestType);
    if (price === undefined) {
      problems.push(`no price in the snapshot for request type ${request.requestType}`);
      continue;
    }
    if (
      !isNonNegativeSafeInteger(request.inputTokensPerRequest) ||
      !isNonNegativeSafeInteger(request.outputTokensPerRequest) ||
      !isNonNegativeSafeInteger(request.requestsPerMonth)
    ) {
      problems.push(`assumptions for ${request.requestType} must be non-negative whole numbers`);
      continue;
    }
    const microUsd = requestMicroUsd(
      price,
      request.inputTokensPerRequest,
      request.outputTokensPerRequest,
    );
    const monthly = microUsd * request.requestsPerMonth;
    if (!Number.isSafeInteger(microUsd) || !Number.isSafeInteger(monthly)) {
      problems.push(`cost for ${request.requestType} is too large to compute exactly`);
      continue;
    }
    monthlyMicroUsd += monthly;
    perRequest.push({
      requestType: request.requestType,
      model: price.model,
      microUsd,
      paise: microUsdToPaiseUp(microUsd, paisePerUsd),
    });
  }

  if (problems.length > 0) {
    return { status: "refused", reason: "INVALID_INPUT", problems };
  }

  if (
    !Number.isSafeInteger(monthlyMicroUsd) ||
    !Number.isSafeInteger(monthlyMicroUsd * paisePerUsd)
  ) {
    return {
      status: "refused",
      reason: "INVALID_INPUT",
      problems: ["the projected month is too large to compute exactly"],
    };
  }
  const monthlyPaise = microUsdToPaiseUp(monthlyMicroUsd, paisePerUsd);
  return {
    status: "calculated",
    label: "CALCULATED",
    notMeasured: true,
    priceSnapshotSource: input.priceSnapshotSource.trim(),
    perRequest,
    monthlyMicroUsd,
    monthlyPaise,
    capPaise: input.capPaise,
    withinCap: monthlyPaise <= input.capPaise,
    headroomPaise: input.capPaise - monthlyPaise,
  };
}

/** Worst-rounding-safe cost of one request: each token term is rounded up to whole micro-USD. */
function requestMicroUsd(price: PriceEntry, inputTokens: number, outputTokens: number): number {
  return (
    tokensToMicroUsdUp(inputTokens, price.inputMicroUsdPerMillion) +
    tokensToMicroUsdUp(outputTokens, price.outputMicroUsdPerMillion)
  );
}

function tokensToMicroUsdUp(tokens: number, microUsdPerMillion: number): number {
  return Math.ceil((tokens * microUsdPerMillion) / 1_000_000);
}

function microUsdToPaiseUp(microUsd: number, paisePerUsd: number): number {
  return Math.ceil((microUsd * paisePerUsd) / 1_000_000);
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
