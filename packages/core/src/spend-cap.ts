/**
 * Monthly spend cap for paid speech and AI calls.
 *
 * Amounts are integer minor units (paise), never floats, so the cap cannot drift by rounding.
 * This is the on-device decision logic. The broker enforces the same cap server-side;
 * the app mirrors usage for display only.
 */
export type SpendDecision =
  { allowed: true } | { allowed: false; reason: "CAP_REACHED" | "INVALID_AMOUNT" };

export class SpendCap {
  private spentMinor: number;

  constructor(
    private readonly capMinor: number,
    spentMinor = 0,
  ) {
    assertNonNegativeInteger(capMinor, "cap");
    assertNonNegativeInteger(spentMinor, "spent");
    this.spentMinor = spentMinor;
  }

  get spent(): number {
    return this.spentMinor;
  }

  get remaining(): number {
    return Math.max(0, this.capMinor - this.spentMinor);
  }

  /** Decides whether a call with this estimated cost may start. Nothing is recorded. */
  decide(estimatedCostMinor: number): SpendDecision {
    if (!isNonNegativeInteger(estimatedCostMinor)) {
      return { allowed: false, reason: "INVALID_AMOUNT" };
    }
    if (this.spentMinor + estimatedCostMinor > this.capMinor) {
      return { allowed: false, reason: "CAP_REACHED" };
    }
    return { allowed: true };
  }

  /** Records the actual cost of a completed call. */
  record(actualCostMinor: number): void {
    assertNonNegativeInteger(actualCostMinor, "cost");
    this.spentMinor += actualCostMinor;
  }

  /** Starts a new calendar month. Spend resets to zero; the cap is unchanged. */
  startNewMonth(): void {
    this.spentMinor = 0;
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!isNonNegativeInteger(value)) {
    throw new RangeError(`${name} must be a non-negative safe integer in minor units`);
  }
}
