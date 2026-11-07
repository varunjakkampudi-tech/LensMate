/**
 * Durable budget and quota accounting. The cap is enforced here, on the server.
 *
 * Every provider attempt reserves its worst-case cost before the call. The reservation is settled to the actual
 * cost when the provider answers, or released when the attempt fails. A reservation is never reused for a second
 * attempt, so a retry is always charged in full. Spend plus reservations can therefore never exceed the cap,
 * even with concurrent requests and provider failures.
 */
export type ReserveRefusal = "BUDGET_EXHAUSTED" | "QUOTA_EXCEEDED";

/**
 * Bucket key for the development-test cap. It is not a calendar month, so the spend never resets: the cap is
 * cumulative until the owner changes the configuration.
 */
export const DEV_TEST_BUCKET = "DEV-TEST-CUMULATIVE";

export type ReserveResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: ReserveRefusal };

export interface ReserveInput {
  readonly reservationId: string;
  readonly clientId: string;
  /** Calendar month the spend is charged to, "YYYY-MM" (UTC). Every paid attempt counts against this monthly bucket. */
  readonly month: string;
  /** Calendar day used for the client's request quota, "YYYY-MM-DD" (UTC). */
  readonly day: string;
  readonly amountPaise: number;
  /** Monthly cap in paise. */
  readonly capPaise: number;
  /**
   * Cumulative development-test cap in paise. When set, the attempt also counts against the DEV_TEST_BUCKET, and the
   * reservation is refused if either the monthly cap or this cap would be exceeded. Both caps always apply together.
   */
  readonly devTestCapPaise?: number | undefined;
  readonly dailyRequestQuota: number;
}

/** The buckets one reservation is charged to. The monthly bucket always; the development-test bucket when configured. */
export function bucketsFor(
  input: Pick<ReserveInput, "month" | "devTestCapPaise">,
): readonly string[] {
  return input.devTestCapPaise === undefined ? [input.month] : [input.month, DEV_TEST_BUCKET];
}

export interface BudgetSummary {
  readonly month: string;
  readonly spentPaise: number;
  readonly reservedPaise: number;
}

export interface BudgetStore {
  reserve(input: ReserveInput): Promise<ReserveResult>;
  settle(reservationId: string, actualPaise: number): Promise<void>;
  release(reservationId: string): Promise<void>;
  summary(month: string): Promise<BudgetSummary>;
  /** Liveness check for the health endpoint. Rejects when the store is unreachable. */
  ping(): Promise<void>;
}

export class ReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationError";
  }
}

function assertPaise(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of paise`);
  }
}

/**
 * In-memory store. Each operation completes synchronously inside one turn of the event loop, so no two
 * reservations interleave. It is correct for one process only; the PostgreSQL store is used in production.
 */
export class InMemoryBudgetStore implements BudgetStore {
  private readonly buckets = new Map<string, { spent: number; reserved: number }>();
  private readonly quotas = new Map<string, number>();
  private readonly reservations = new Map<
    string,
    {
      buckets: readonly string[];
      quotaKey: string;
      amount: number;
      state: "reserved" | "settled" | "released";
    }
  >();

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    assertPaise(input.amountPaise, "amount");
    assertPaise(input.capPaise, "cap");
    if (input.devTestCapPaise !== undefined) {
      assertPaise(input.devTestCapPaise, "development-test cap");
    }
    if (this.reservations.has(input.reservationId)) {
      throw new ReservationError("reservation id already used");
    }
    const quotaKey = `${input.clientId}|${input.day}`;
    const used = this.quotas.get(quotaKey) ?? 0;
    if (used >= input.dailyRequestQuota) {
      return Promise.resolve({ ok: false, reason: "QUOTA_EXCEEDED" });
    }

    const buckets = bucketsFor(input);
    const caps = new Map<string, number>([[input.month, input.capPaise]]);
    if (input.devTestCapPaise !== undefined) {
      caps.set(DEV_TEST_BUCKET, input.devTestCapPaise);
    }
    // Every bucket is checked before any is charged, so a refusal never leaves a partial reservation behind.
    for (const bucket of buckets) {
      const value = this.buckets.get(bucket) ?? { spent: 0, reserved: 0 };
      if (value.spent + value.reserved + input.amountPaise > (caps.get(bucket) ?? 0)) {
        return Promise.resolve({ ok: false, reason: "BUDGET_EXHAUSTED" });
      }
    }
    for (const bucket of buckets) {
      const value = this.buckets.get(bucket) ?? { spent: 0, reserved: 0 };
      value.reserved += input.amountPaise;
      this.buckets.set(bucket, value);
    }
    this.quotas.set(quotaKey, used + 1);
    this.reservations.set(input.reservationId, {
      buckets,
      quotaKey,
      amount: input.amountPaise,
      state: "reserved",
    });
    return Promise.resolve({ ok: true });
  }

  async settle(reservationId: string, actualPaise: number): Promise<void> {
    assertPaise(actualPaise, "actual");
    const reservation = this.open(reservationId);
    for (const bucket of reservation.buckets) {
      const value = this.bucket(bucket);
      value.reserved -= reservation.amount;
      value.spent += actualPaise;
    }
    reservation.state = "settled";
    return Promise.resolve();
  }

  async release(reservationId: string): Promise<void> {
    const reservation = this.open(reservationId);
    for (const bucket of reservation.buckets) {
      this.bucket(bucket).reserved -= reservation.amount;
    }
    reservation.state = "released";
    return Promise.resolve();
  }

  async summary(month: string): Promise<BudgetSummary> {
    const value = this.buckets.get(month) ?? { spent: 0, reserved: 0 };
    return Promise.resolve({ month, spentPaise: value.spent, reservedPaise: value.reserved });
  }

  async ping(): Promise<void> {
    return Promise.resolve();
  }

  private bucket(key: string): { spent: number; reserved: number } {
    const value = this.buckets.get(key);
    if (value === undefined) {
      throw new ReservationError("bucket missing for reservation");
    }
    return value;
  }

  private open(reservationId: string): {
    buckets: readonly string[];
    quotaKey: string;
    amount: number;
    state: "reserved" | "settled" | "released";
  } {
    const reservation = this.reservations.get(reservationId);
    if (reservation === undefined || reservation.state !== "reserved") {
      throw new ReservationError("reservation is not open");
    }
    return reservation;
  }
}
