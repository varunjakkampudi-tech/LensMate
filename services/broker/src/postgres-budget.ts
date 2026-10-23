import type { Pool, PoolClient } from "pg";
import {
  ReservationError,
  type BudgetStore,
  type BudgetSummary,
  type ReserveInput,
  type ReserveResult,
} from "./budget.js";

/**
 * PostgreSQL implementation. Each reservation runs in one transaction. It locks the month row first and the
 * client's daily quota row second, always in that order, so concurrent reservations serialize on the database
 * rather than on stale in-process counters. Reads for the cap decision happen under the lock, never from a cache.
 */
export class PostgresBudgetStore implements BudgetStore {
  constructor(private readonly pool: Pool) {}

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    assertPaise(input.amountPaise, "amount");
    assertPaise(input.capPaise, "cap");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO broker_budget_month (month) VALUES ($1) ON CONFLICT (month) DO NOTHING",
        [input.month],
      );
      const month = await client.query<{ spent_paise: string; reserved_paise: string }>(
        "SELECT spent_paise, reserved_paise FROM broker_budget_month WHERE month = $1 FOR UPDATE",
        [input.month],
      );
      await client.query(
        "INSERT INTO broker_daily_quota (client_id, day) VALUES ($1, $2) ON CONFLICT (client_id, day) DO NOTHING",
        [input.clientId, input.day],
      );
      const quota = await client.query<{ requests: number }>(
        "SELECT requests FROM broker_daily_quota WHERE client_id = $1 AND day = $2 FOR UPDATE",
        [input.clientId, input.day],
      );
      const row = month.rows[0];
      const quotaRow = quota.rows[0];
      if (row === undefined || quotaRow === undefined) {
        throw new ReservationError("ledger row missing under lock");
      }
      if (quotaRow.requests >= input.dailyRequestQuota) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "QUOTA_EXCEEDED" };
      }
      const spent = BigInt(row.spent_paise);
      const reserved = BigInt(row.reserved_paise);
      if (spent + reserved + BigInt(input.amountPaise) > BigInt(input.capPaise)) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "BUDGET_EXHAUSTED" };
      }
      await client.query(
        "UPDATE broker_daily_quota SET requests = requests + 1 WHERE client_id = $1 AND day = $2",
        [input.clientId, input.day],
      );
      await client.query(
        "UPDATE broker_budget_month SET reserved_paise = reserved_paise + $2 WHERE month = $1",
        [input.month, input.amountPaise],
      );
      await client.query(
        "INSERT INTO broker_reservation (reservation_id, client_id, month, amount_paise, state) VALUES ($1, $2, $3, $4, 'reserved')",
        [input.reservationId, input.clientId, input.month, input.amountPaise],
      );
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async settle(reservationId: string, actualPaise: number): Promise<void> {
    assertPaise(actualPaise, "actual");
    await this.close(reservationId, "settled", actualPaise);
  }

  async release(reservationId: string): Promise<void> {
    await this.close(reservationId, "released", 0);
  }

  async summary(month: string): Promise<BudgetSummary> {
    const result = await this.pool.query<{ spent_paise: string; reserved_paise: string }>(
      "SELECT spent_paise, reserved_paise FROM broker_budget_month WHERE month = $1",
      [month],
    );
    const row = result.rows[0];
    return {
      month,
      spentPaise: row === undefined ? 0 : Number(row.spent_paise),
      reservedPaise: row === undefined ? 0 : Number(row.reserved_paise),
    };
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  /**
   * Charges open reservations older than maxAgeSeconds at their worst case. These are attempts whose settlement
   * never reached the ledger (a crash or a database failure mid-call). Charging them keeps the cap conservative.
   * SKIP LOCKED lets several broker processes reap without waiting on each other. Returns the number charged.
   */
  async reapStale(maxAgeSeconds: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const stale = await client.query<{
        reservation_id: string;
        month: string;
        amount_paise: string;
      }>(
        "SELECT reservation_id, month, amount_paise FROM broker_reservation WHERE state = 'reserved' AND created_at < now() - ($1::int * interval '1 second') ORDER BY created_at FOR UPDATE SKIP LOCKED",
        [maxAgeSeconds],
      );
      for (const row of stale.rows) {
        await client.query(
          "UPDATE broker_budget_month SET reserved_paise = reserved_paise - $2, spent_paise = spent_paise + $2 WHERE month = $1",
          [row.month, row.amount_paise],
        );
        await client.query(
          "UPDATE broker_reservation SET state = 'settled', actual_paise = $2, closed_at = now() WHERE reservation_id = $1",
          [row.reservation_id, row.amount_paise],
        );
      }
      await client.query("COMMIT");
      return stale.rows.length;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async close(
    reservationId: string,
    state: "settled" | "released",
    actualPaise: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ month: string; amount_paise: string; state: string }>(
        "SELECT month, amount_paise, state FROM broker_reservation WHERE reservation_id = $1 FOR UPDATE",
        [reservationId],
      );
      const row = found.rows[0];
      if (row === undefined || row.state !== "reserved") {
        throw new ReservationError("reservation is not open");
      }
      await client.query(
        "UPDATE broker_budget_month SET reserved_paise = reserved_paise - $2 WHERE month = $1",
        [row.month, row.amount_paise],
      );
      if (state === "settled") {
        await client.query(
          "UPDATE broker_budget_month SET spent_paise = spent_paise + $2 WHERE month = $1",
          [row.month, actualPaise],
        );
      }
      await client.query(
        "UPDATE broker_reservation SET state = $2, actual_paise = $3, closed_at = now() WHERE reservation_id = $1",
        [reservationId, state, state === "settled" ? actualPaise : null],
      );
      await client.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original error is the one that matters. A failed rollback closes the connection on release.
  }
}

function assertPaise(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of paise`);
  }
}
