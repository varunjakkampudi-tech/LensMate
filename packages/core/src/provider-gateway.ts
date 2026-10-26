import { SpendCap } from "./spend-cap.js";

/**
 * App gateway for speech, translation and AI calls.
 *
 * Every paid call passes these checks in order: disclosure accepted for the feature, spend cap
 * circuit breaker, then a bounded number of attempts, each with a timeout. Only the broker
 * performs the provider call with keys; this gateway only decides, times and accounts.
 */
export type GatewayErrorCode =
  | "DISCLOSURE_REQUIRED"
  | "CAP_REACHED"
  | "QUOTA_EXCEEDED"
  | "UNAUTHORIZED"
  | "INVALID_AMOUNT"
  | "CIRCUIT_OPEN"
  | "TIMEOUT"
  | "PROVIDER_ERROR";

/**
 * An error a provider run can throw to say how the gateway should treat it. `retryable: false` stops the
 * attempts at once, and `gatewayCode` is reported to the caller instead of PROVIDER_ERROR.
 */
export interface ClassifiedProviderError {
  readonly gatewayCode: GatewayErrorCode;
  readonly retryable: boolean;
}

export type GatewayResult<T> =
  { ok: true; value: T; costMinor: number } | { ok: false; errorCode: GatewayErrorCode };

/** One provider attempt. It must stop when the signal aborts. */
export type ProviderRun<T> = (signal: AbortSignal) => Promise<{ value: T; costMinor: number }>;

export interface GatewayOptions {
  readonly timeoutMs: number;
  readonly maxAttempts: 1 | 2 | 3;
  readonly circuitFailureThreshold: number;
  readonly circuitCooldownMs: number;
  readonly now: () => number;
}

/** Raised when an attempt does not finish within its timeout. */
export class ProviderTimeout extends Error {
  constructor() {
    super("provider attempt timed out");
    this.name = "ProviderTimeout";
  }
}

export class ProviderGateway {
  private readonly disclosedFeatures = new Set<string>();
  private consecutiveFailures = 0;
  private circuitOpenUntilMs = 0;

  constructor(
    private readonly spendCap: SpendCap,
    private readonly options: GatewayOptions,
  ) {}

  /** Records that the user saw and accepted the cloud disclosure for a feature. */
  acceptDisclosure(feature: string): void {
    this.disclosedFeatures.add(feature);
  }

  async call<T>(
    feature: string,
    estimatedCostMinor: number,
    run: ProviderRun<T>,
  ): Promise<GatewayResult<T>> {
    if (!this.disclosedFeatures.has(feature)) {
      return { ok: false, errorCode: "DISCLOSURE_REQUIRED" };
    }
    if (this.isCircuitOpen()) {
      return { ok: false, errorCode: "CIRCUIT_OPEN" };
    }
    for (let attempt = 1; ; attempt += 1) {
      const decision = this.spendCap.decide(estimatedCostMinor);
      if (!decision.allowed) {
        return { ok: false, errorCode: decision.reason };
      }
      try {
        const { value, costMinor } = await runWithTimeout(run, this.options.timeoutMs);
        this.spendCap.record(costMinor);
        this.consecutiveFailures = 0;
        return { ok: true, value, costMinor };
      } catch (error) {
        const classified = classify(error);
        const errorCode = error instanceof ProviderTimeout ? "TIMEOUT" : classified.gatewayCode;
        // Only transient outcomes open the circuit. A budget, quota or authorization refusal is not an outage.
        if (errorCode === "TIMEOUT" || classified.retryable) {
          this.recordFailure();
        }
        if (
          errorCode === "TIMEOUT" ||
          !classified.retryable ||
          attempt === this.options.maxAttempts ||
          this.isCircuitOpen()
        ) {
          return { ok: false, errorCode };
        }
      }
    }
  }

  private isCircuitOpen(): boolean {
    return this.circuitOpenUntilMs > this.options.now();
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.circuitFailureThreshold) {
      this.circuitOpenUntilMs = this.options.now() + this.options.circuitCooldownMs;
      this.consecutiveFailures = 0;
    }
  }
}

function classify(error: unknown): ClassifiedProviderError {
  if (
    typeof error === "object" &&
    error !== null &&
    "gatewayCode" in error &&
    "retryable" in error &&
    typeof error.gatewayCode === "string" &&
    typeof error.retryable === "boolean"
  ) {
    return { gatewayCode: error.gatewayCode as GatewayErrorCode, retryable: error.retryable };
  }
  return { gatewayCode: "PROVIDER_ERROR", retryable: true };
}

function runWithTimeout<T>(
  run: ProviderRun<T>,
  timeoutMs: number,
): Promise<{ value: T; costMinor: number }> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeout());
    }, timeoutMs);
    run(controller.signal).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
