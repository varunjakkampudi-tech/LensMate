import type { Pool, PoolClient } from "pg";
import {
  DEV_TEST_BUCKET,
  ReservationError,
  bucketsFor,
  type BudgetStore,
  type BudgetSummary,
  type ReserveInput,
  type ReserveResult,
} from "./budget.js";

interface BucketLock {
  readonly spent: bigint;
  readonly reserved: bigint;
}

/**
 * PostgreSQL implementation. Each reservation runs in one transaction. It locks the monthly bucket first, then the
 * development-test bucket (when configured), then the client's daily quota row, always in that order, so concurrent
 * reservations serialize on the database rather than on stale in-process counters. Every paid attempt is charged to the
 * monthly bucket; when a development-test cap is configured it is also charged to the cumulative bucket. An attempt is
 * refused unless both caps have room, and a settlement or reaper charge updates every bucket the reservation holds.
 */
export class PostgresBudgetStore implements BudgetStore {
  constructor(private readonly pool: Pool) {}

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    assertPaise(input.amountPaise, "amount");
    assertPaise(input.capPaise, "cap");
    if (input.devTestCapPaise !== undefined) {
      assertPaise(input.devTestCapPaise, "development-test cap");
    }
    const client = await this.pool.connect();
    let brokenConnection = false;
    try {
      await client.query("BEGIN");
      const monthly = await lockBucket(client, input.month);
      const development =
        input.devTestCapPaise === undefined ? undefined : await lockBucket(client, DEV_TEST_BUCKET);
      await client.query(
        "INSERT INTO broker_daily_quota (client_id, day) VALUES ($1, $2) ON CONFLICT (client_id, day) DO NOTHING",
        [input.clientId, input.day],
      );
      const quota = await client.query<{ requests: number }>(
        "SELECT requests FROM broker_daily_quota WHERE client_id = $1 AND day = $2 FOR UPDATE",
        [input.clientId, input.day],
      );
      const quotaRow = quota.rows[0];
      if (quotaRow === undefined) {
        throw new ReservationError("quota row missing under lock");
      }
      if (quotaRow.requests >= input.dailyRequestQuota) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "QUOTA_EXCEEDED" };
      }
      const amount = BigInt(input.amountPaise);
      if (exceeds(monthly, amount, BigInt(input.capPaise))) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "BUDGET_EXHAUSTED" };
      }
      if (
        development !== undefined &&
        input.devTestCapPaise !== undefined &&
        exceeds(development, amount, BigInt(input.devTestCapPaise))
      ) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "BUDGET_EXHAUSTED" };
      }
      await client.query(
        "UPDATE broker_daily_quota SET requests = requests + 1 WHERE client_id = $1 AND day = $2",
        [input.clientId, input.day],
      );
      for (const bucket of bucketsFor(input)) {
        await client.query(
          "UPDATE broker_budget_month SET reserved_paise = reserved_paise + $2 WHERE month = $1",
          [bucket, input.amountPaise],
        );
      }
      await client.query(
        "INSERT INTO broker_reservation (reservation_id, client_id, month, amount_paise, state, dev_test) VALUES ($1, $2, $3, $4, 'reserved', $5)",
        [
          input.reservationId,
          input.clientId,
          input.month,
          input.amountPaise,
          input.devTestCapPaise !== undefined,
        ],
      );
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      brokenConnection = !(await rollbackQuietly(client));
      throw error;
    } finally {
      client.release(brokenConnection ? true : undefined);
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
   * never reached the ledger (a crash or a database failure mid-call). Charging them keeps the caps conservative.
   * SKIP LOCKED lets several broker processes reap without waiting on each other. Returns the number charged.
   */
  async reapStale(
    maxAgeSeconds: number,
    onSkip?: (reservationId: string, reason: string) => void,
  ): Promise<number> {
    const client = await this.pool.connect();
    let brokenConnection = false;
    try {
      await client.query("BEGIN");
      const stale = await client.query<{
        reservation_id: string;
        month: string;
        amount_paise: string;
        dev_test: boolean;
      }>(
        "SELECT reservation_id, month, amount_paise, dev_test FROM broker_reservation WHERE state = 'reserved' AND created_at < now() - ($1::int * interval '1 second') ORDER BY created_at FOR UPDATE SKIP LOCKED",
        [maxAgeSeconds],
      );
      let reaped = 0;
      for (const row of stale.rows) {
        // A savepoint per row: one row that cannot be settled is skipped and stays open for the next pass, so it
        // does not roll back the rest of the batch. The settlement trigger charges every bucket the row holds.
        // The consistency checks are deferred to COMMIT. Checking this row now makes a drifted month fail here, inside
        // its own savepoint, instead of rolling back the whole batch at COMMIT.
        await client.query("SAVEPOINT reap_row");
        try {
          await client.query(
            "UPDATE broker_reservation SET state = 'settled', actual_paise = $2, closed_at = now() WHERE reservation_id = $1",
            [row.reservation_id, row.amount_paise],
          );
          // Only after the row's own statement completes, so the check sees the closed row, not the one mid-update.
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
          await client.query("SET CONSTRAINTS ALL DEFERRED");
          await client.query("RELEASE SAVEPOINT reap_row");
          reaped += 1;
        } catch (error) {
          // The row stays open and is retried on the next pass. The rest of the batch is not affected.
          onSkip?.(row.reservation_id, error instanceof Error ? error.message : "unknown error");
          await client.query("ROLLBACK TO SAVEPOINT reap_row");
          await client.query("RELEASE SAVEPOINT reap_row");
          await client.query("SET CONSTRAINTS ALL DEFERRED");
        }
      }
      await client.query("COMMIT");
      return reaped;
    } catch (error) {
      brokenConnection = !(await rollbackQuietly(client));
      throw error;
    } finally {
      client.release(brokenConnection ? true : undefined);
    }
  }

  private async close(
    reservationId: string,
    state: "settled" | "released",
    actualPaise: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    let brokenConnection = false;
    try {
      await client.query("BEGIN");
      const found = await client.query<{ state: string }>(
        "SELECT state FROM broker_reservation WHERE reservation_id = $1 FOR UPDATE",
        [reservationId],
      );
      const row = found.rows[0];
      if (row === undefined || row.state !== "reserved") {
        throw new ReservationError("reservation is not open");
      }
      // The settlement trigger in the database charges every bucket the reservation holds, in this same statement.
      await client.query(
        "UPDATE broker_reservation SET state = $2, actual_paise = $3, closed_at = now() WHERE reservation_id = $1",
        [reservationId, state, state === "settled" ? actualPaise : null],
      );
      await client.query("COMMIT");
    } catch (error) {
      brokenConnection = !(await rollbackQuietly(client));
      throw error;
    } finally {
      client.release(brokenConnection ? true : undefined);
    }
  }
}

/** Creates the bucket row if needed, then locks it. Callers lock buckets in the fixed order documented on the class. */
async function lockBucket(client: PoolClient, bucket: string): Promise<BucketLock> {
  await client.query(
    "INSERT INTO broker_budget_month (month) VALUES ($1) ON CONFLICT (month) DO NOTHING",
    [bucket],
  );
  const result = await client.query<{ spent_paise: string; reserved_paise: string }>(
    "SELECT spent_paise, reserved_paise FROM broker_budget_month WHERE month = $1 FOR UPDATE",
    [bucket],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ReservationError("ledger row missing under lock");
  }
  return { spent: BigInt(row.spent_paise), reserved: BigInt(row.reserved_paise) };
}

function exceeds(bucket: BucketLock, amount: bigint, cap: bigint): boolean {
  return bucket.spent + bucket.reserved + amount > cap;
}

/** Returns false when the rollback itself failed, so the caller destroys the connection instead of pooling it. */
async function rollbackQuietly(client: PoolClient): Promise<boolean> {
  try {
    await client.query("ROLLBACK");
    return true;
  } catch {
    // The original error is the one that matters.
    return false;
  }
}

function assertPaise(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of paise`);
  }
}
