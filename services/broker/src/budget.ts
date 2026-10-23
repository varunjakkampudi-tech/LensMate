/**
 * Durable budget and quota accounting (Goal 10A.3; Amendment C.5). The cap is enforced here, on the server.
 *
 * Every provider attempt reserves its worst-case cost before the call. The reservation is settled to the actual
 * cost when the provider answers, or released when the attempt fails. A reservation is never reused for a second
 * attempt, so a retry is always charged in full. Spend plus reservations can therefore never exceed the cap,
 * even with concurrent requests and provider failures.
 */
export type ReserveRefusal = "BUDGET_EXHAUSTED" | "QUOTA_EXCEEDED";

export type ReserveResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: ReserveRefusal };

export interface ReserveInput {
  readonly reservationId: string;
  readonly clientId: string;
  /** Calendar month the spend is charged to, "YYYY-MM" (UTC). */
  readonly month: string;
  /** Calendar day used for the client's request quota, "YYYY-MM-DD" (UTC). */
  readonly day: string;
  readonly amountPaise: number;
  readonly capPaise: number;
  readonly dailyRequestQuota: number;
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
  private readonly months = new Map<string, { spent: number; reserved: number }>();
  private readonly quotas = new Map<string, number>();
  private readonly reservations = new Map<
    string,
    { month: string; quotaKey: string; amount: number; state: "reserved" | "settled" | "released" }
  >();

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    assertPaise(input.amountPaise, "amount");
    assertPaise(input.capPaise, "cap");
    if (this.reservations.has(input.reservationId)) {
      throw new ReservationError("reservation id already used");
    }
    const month = this.months.get(input.month) ?? { spent: 0, reserved: 0 };
    this.months.set(input.month, month);
    const quotaKey = `${input.clientId}|${input.day}`;
    const used = this.quotas.get(quotaKey) ?? 0;

    if (used >= input.dailyRequestQuota) {
      return Promise.resolve({ ok: false, reason: "QUOTA_EXCEEDED" });
    }
    if (month.spent + month.reserved + input.amountPaise > input.capPaise) {
      return Promise.resolve({ ok: false, reason: "BUDGET_EXHAUSTED" });
    }
    month.reserved += input.amountPaise;
    this.quotas.set(quotaKey, used + 1);
    this.reservations.set(input.reservationId, {
      month: input.month,
      quotaKey,
      amount: input.amountPaise,
      state: "reserved",
    });
    return Promise.resolve({ ok: true });
  }

  async settle(reservationId: string, actualPaise: number): Promise<void> {
    assertPaise(actualPaise, "actual");
    const reservation = this.open(reservationId);
    const month = this.months.get(reservation.month);
    if (month === undefined) {
      throw new ReservationError("month missing for reservation");
    }
    month.reserved -= reservation.amount;
    month.spent += actualPaise;
    reservation.state = "settled";
    return Promise.resolve();
  }

  async release(reservationId: string): Promise<void> {
    const reservation = this.open(reservationId);
    const month = this.months.get(reservation.month);
    if (month === undefined) {
      throw new ReservationError("month missing for reservation");
    }
    month.reserved -= reservation.amount;
    reservation.state = "released";
    return Promise.resolve();
  }

  async summary(month: string): Promise<BudgetSummary> {
    const value = this.months.get(month) ?? { spent: 0, reserved: 0 };
    return Promise.resolve({ month, spentPaise: value.spent, reservedPaise: value.reserved });
  }

  async ping(): Promise<void> {
    return Promise.resolve();
  }

  private open(reservationId: string): {
    month: string;
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
