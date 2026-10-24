import { Pool } from "pg";
import { DEV_TEST_BUCKET, type ReserveInput } from "./budget.js";
import { PostgresBudgetStore } from "./postgres-budget.js";
import { migrate } from "./schema.js";

const APP_ROLE = "broker_app_test";
const ADMIN_ROLE = "broker_admin_test";

/**
 * Real PostgreSQL integration (Engineering Standards, broker integration with PostgreSQL in CI).
 *
 * Runs only when BROKER_TEST_DATABASE_URL is set. It DROPS and recreates the broker tables, so the URL must point
 * at a dedicated test database, never at production or a shared database. Without the variable this suite is
 * reported as skipped, and that skip is not evidence that the ledger was tested.
 */
const URL_VALUE = process.env.BROKER_TEST_DATABASE_URL;
const suite = URL_VALUE === undefined ? describe.skip : describe;

function reserveInput(id: string, overrides: Partial<ReserveInput> = {}): ReserveInput {
  return {
    reservationId: id,
    clientId: "app-1",
    month: "2026-10",
    day: "2026-10-24",
    amountPaise: 10,
    capPaise: 100,
    dailyRequestQuota: 1000,
    ...overrides,
  };
}

suite("PostgresBudgetStore against a real PostgreSQL database", () => {
  let pools: Pool[] = [];
  let store: PostgresBudgetStore;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: URL_VALUE, max: 1 });
    await admin.query(
      "DROP TABLE IF EXISTS broker_memory_backup, broker_reservation, broker_daily_quota, broker_budget_month, broker_device, broker_enrolment_code",
    );
    await admin.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'broker_app_test') THEN CREATE ROLE broker_app_test LOGIN; END IF; END $$",
    );
    await admin.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'broker_admin_test') THEN CREATE ROLE broker_admin_test LOGIN; END IF; END $$",
    );
    await admin.end();
  });

  beforeEach(async () => {
    const pool = new Pool({ connectionString: URL_VALUE, max: 10 });
    pools = [pool];
    store = new PostgresBudgetStore(pool);
    await migrate(pool, APP_ROLE, ADMIN_ROLE);
    await pool.query("TRUNCATE broker_reservation, broker_daily_quota, broker_budget_month");
  });

  afterEach(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    pools = [];
  });

  it("applies the schema idempotently", async () => {
    const again = new Pool({ connectionString: URL_VALUE, max: 1 });
    pools.push(again);
    await migrate(again, APP_ROLE, ADMIN_ROLE);
    await migrate(again, APP_ROLE, ADMIN_ROLE);
    await expect(store.ping()).resolves.toBeUndefined();
  });

  it("accepts a reservation that lands exactly on the cap and refuses one paisa more", async () => {
    expect(await store.reserve(reserveInput("a", { amountPaise: 100 }))).toEqual({ ok: true });
    expect(await store.reserve(reserveInput("b", { amountPaise: 1 }))).toEqual({
      ok: false,
      reason: "BUDGET_EXHAUSTED",
    });
  });

  it("enforces the daily request quota and says so", async () => {
    for (const id of ["a", "b"]) {
      expect(
        await store.reserve(reserveInput(id, { dailyRequestQuota: 2, amountPaise: 1 })),
      ).toEqual({ ok: true });
    }
    expect(
      await store.reserve(reserveInput("c", { dailyRequestQuota: 2, amountPaise: 1 })),
    ).toEqual({
      ok: false,
      reason: "QUOTA_EXCEEDED",
    });
  });

  it("settles spend to the actual cost and frees the rest of the reservation", async () => {
    await store.reserve(reserveInput("a", { amountPaise: 60 }));
    await store.settle("a", 25);
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 25,
      reservedPaise: 0,
    });
  });

  it("releases a failed attempt back to the budget", async () => {
    await store.reserve(reserveInput("a", { amountPaise: 100 }));
    await store.release("a");
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 0,
      reservedPaise: 0,
    });
    expect(await store.reserve(reserveInput("b", { amountPaise: 100 }))).toEqual({ ok: true });
  });

  it("refuses to close a reservation twice", async () => {
    await store.reserve(reserveInput("a"));
    await store.settle("a", 5);
    await expect(store.settle("a", 5)).rejects.toThrow(/not open/);
    await expect(store.release("a")).rejects.toThrow(/not open/);
  });

  it("never lets 100 concurrent reservations exceed the cap", async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        store.reserve(reserveInput(`c-${String(index)}`, { amountPaise: 10 })),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(10);
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 0,
      reservedPaise: 100,
    });
  });

  it("holds the cap across two separate connection pools, as two processes would", async () => {
    const second = new Pool({ connectionString: URL_VALUE, max: 10 });
    pools.push(second);
    const otherStore = new PostgresBudgetStore(second);

    const results = await Promise.all(
      Array.from({ length: 80 }, (_, index) => {
        const target = index % 2 === 0 ? store : otherStore;
        return target.reserve(reserveInput(`p-${String(index)}`, { amountPaise: 10 }));
      }),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(10);
    const summary = await store.summary("2026-10");
    expect(summary.reservedPaise + summary.spentPaise).toBe(100);
  });

  it("charges a stale open reservation at its worst case, and leaves fresh ones alone", async () => {
    await store.reserve(reserveInput("old", { amountPaise: 40 }));
    await store.reserve(reserveInput("fresh", { amountPaise: 20 }));
    const admin = new Pool({ connectionString: URL_VALUE, max: 1 });
    pools.push(admin);
    await admin.query(
      "UPDATE broker_reservation SET created_at = now() - interval '2 hours' WHERE reservation_id = 'old'",
    );

    expect(await store.reapStale(300)).toBe(1);
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 40,
      reservedPaise: 20,
    });
    expect(await store.reapStale(300)).toBe(0);
  });

  it("keeps spend and reservations consistent when settles and reserves run together", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.reserve(reserveInput(`s-${String(index)}`, { amountPaise: 5, capPaise: 1000 })),
      ),
    );
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.settle(`s-${String(index)}`, 3)),
    );
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 60,
      reservedPaise: 0,
    });
  });

  describe("dual cap: the monthly and development-test caps both apply", () => {
    const dual = { capPaise: 1000, devTestCapPaise: 100, amountPaise: 10 };

    it("refuses when the monthly cap is full, and charges neither bucket", async () => {
      expect(await store.reserve(reserveInput("m-1", { ...dual, capPaise: 10 }))).toEqual({
        ok: true,
      });
      expect(await store.reserve(reserveInput("m-2", { ...dual, capPaise: 10 }))).toEqual({
        ok: false,
        reason: "BUDGET_EXHAUSTED",
      });
      expect((await store.summary(DEV_TEST_BUCKET)).reservedPaise).toBe(10);
      expect((await store.summary("2026-10")).reservedPaise).toBe(10);
    });

    it("refuses when the development cap is full, even though the monthly cap has room", async () => {
      expect(await store.reserve(reserveInput("d-1", { ...dual, devTestCapPaise: 10 }))).toEqual({
        ok: true,
      });
      expect(await store.reserve(reserveInput("d-2", { ...dual, devTestCapPaise: 10 }))).toEqual({
        ok: false,
        reason: "BUDGET_EXHAUSTED",
      });
      expect((await store.summary("2026-10")).reservedPaise).toBe(10);
    });

    it("keeps the development bucket cumulative across a calendar-month change", async () => {
      expect(
        await store.reserve(
          reserveInput("y-1", { ...dual, month: "2026-10", devTestCapPaise: 10 }),
        ),
      ).toEqual({ ok: true });
      await store.settle("y-1", 10);
      expect(
        await store.reserve(
          reserveInput("y-2", { ...dual, month: "2026-11", devTestCapPaise: 10 }),
        ),
      ).toEqual({ ok: false, reason: "BUDGET_EXHAUSTED" });
      expect(await store.summary(DEV_TEST_BUCKET)).toEqual({
        month: DEV_TEST_BUCKET,
        spentPaise: 10,
        reservedPaise: 0,
      });
    });

    it("never lets concurrent reservations across two pools exceed the development cap", async () => {
      const second = new Pool({ connectionString: URL_VALUE, max: 10 });
      pools.push(second);
      const otherStore = new PostgresBudgetStore(second);
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, index) => {
          const target = index % 2 === 0 ? store : otherStore;
          return target.reserve(
            reserveInput(`x-${String(index)}`, { ...dual, dailyRequestQuota: 1000 }),
          );
        }),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(10);
      const development = await store.summary(DEV_TEST_BUCKET);
      expect(development.reservedPaise + development.spentPaise).toBe(100);
      const monthly = await store.summary("2026-10");
      expect(monthly.reservedPaise + monthly.spentPaise).toBe(100);
    });

    it("settles to the actual cost in both buckets and frees the rest", async () => {
      await store.reserve(reserveInput("st", { ...dual, amountPaise: 60 }));
      await store.settle("st", 25);
      expect(await store.summary(DEV_TEST_BUCKET)).toEqual({
        month: DEV_TEST_BUCKET,
        spentPaise: 25,
        reservedPaise: 0,
      });
      expect(await store.summary("2026-10")).toEqual({
        month: "2026-10",
        spentPaise: 25,
        reservedPaise: 0,
      });
    });

    it("releases a failed development-cap attempt from both buckets", async () => {
      await store.reserve(reserveInput("rl", { ...dual, amountPaise: 60 }));
      await store.release("rl");
      expect(await store.summary(DEV_TEST_BUCKET)).toEqual({
        month: DEV_TEST_BUCKET,
        spentPaise: 0,
        reservedPaise: 0,
      });
      expect(await store.summary("2026-10")).toEqual({
        month: "2026-10",
        spentPaise: 0,
        reservedPaise: 0,
      });
    });

    it("charges a stale development-cap reservation at worst case in both buckets", async () => {
      await store.reserve(reserveInput("stale", { ...dual, amountPaise: 40 }));
      const admin = new Pool({ connectionString: URL_VALUE, max: 1 });
      pools.push(admin);
      await admin.query(
        "UPDATE broker_reservation SET created_at = now() - interval '2 hours' WHERE reservation_id = 'stale'",
      );
      expect(await store.reapStale(300)).toBe(1);
      expect(await store.summary(DEV_TEST_BUCKET)).toEqual({
        month: DEV_TEST_BUCKET,
        spentPaise: 40,
        reservedPaise: 0,
      });
      expect(await store.summary("2026-10")).toEqual({
        month: "2026-10",
        spentPaise: 40,
        reservedPaise: 0,
      });
    });

    it("refuses a direct edit that leaves the development bucket out of step with its reservations", async () => {
      await store.reserve(reserveInput("tamper", { ...dual, amountPaise: 10 }));
      const admin = new Pool({ connectionString: URL_VALUE, max: 1 });
      pools.push(admin);
      await expect(
        admin.query(
          "UPDATE broker_budget_month SET reserved_paise = 0 WHERE month = 'DEV-TEST-CUMULATIVE'",
        ),
      ).rejects.toThrow(/development-test reserved spend does not match/);
    });
  });
});
