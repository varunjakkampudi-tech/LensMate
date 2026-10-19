import { SpendCap } from "./spend-cap.js";

/**
 * App gateway for speech, translation and AI calls (Engineering Standards 4; v9 G2, G10, G33).
 *
 * Every paid call passes these checks in order: disclosure accepted for the feature (G33), spend cap
 * (G10), circuit breaker, then a bounded number of attempts, each with a timeout. Only the broker
 * performs the provider call with keys; this gateway only decides, times and accounts.
 */
export type GatewayErrorCode =
  | "DISCLOSURE_REQUIRED"
  | "CAP_REACHED"
  | "INVALID_AMOUNT"
  | "CIRCUIT_OPEN"
  | "TIMEOUT"
  | "PROVIDER_ERROR";

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

  /** Records that the user saw and accepted the cloud disclosure for a feature (G33). */
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
        const errorCode = error instanceof ProviderTimeout ? "TIMEOUT" : "PROVIDER_ERROR";
        this.recordFailure();
        if (
          errorCode === "TIMEOUT" ||
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
