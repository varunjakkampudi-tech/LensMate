import { Pool } from "pg";
import {
  authenticateDevice,
  InMemoryDeviceStore,
  issueEnrolmentCode,
  normalizeCode,
  PostgresDeviceStore,
  redeemEnrolment,
  sha256Hex,
} from "./devices.js";
import { migrate, SchemaError, verifySchema } from "./schema.js";
import { checkContinuity, FileAnchor, AnchorError } from "./ledger-anchor.js";
import { PostgresBudgetStore } from "./postgres-budget.js";
import { PostgresBackupStore, type BackupStore } from "./backup.js";
import { InMemoryBudgetStore } from "./budget.js";
import { MockProvider } from "./provider.js";
import { buildServer } from "./server.js";
import { TEST_AUTH_HEADER, TEST_CLIENT_SECRET, TEST_DEVICE_ID, testConfig } from "./test-config.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Real PostgreSQL under load: 80 to 100 concurrent statements on Docker for Windows can exceed the 5 s default.
// The limit is per file, so ordinary unit tests keep the default. Security checks stay strict; only time is extended.
jest.setTimeout(120_000);

/**
 * PostgreSQL security tests. They run as the application role and the admin role, not
 * as the owner, so they test what the broker can actually do. Runs only when BROKER_TEST_DATABASE_URL is set. It
 * creates and drops its own database, `broker_security_test`, so it never touches another database.
 */
const BASE_URL = process.env.BROKER_TEST_DATABASE_URL;
const suite = BASE_URL === undefined ? describe.skip : describe;
const DB = "broker_security_test";
const APP_ROLE = "broker_security_app";
const ADMIN_ROLE = "broker_security_admin";

function withDatabase(url: string, database: string, user?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user !== undefined) {
    parsed.username = user;
  }
  return parsed.toString();
}

async function createBackupBroker(backups: BackupStore) {
  const devices = new InMemoryDeviceStore();
  devices.seedDevice(TEST_DEVICE_ID, TEST_CLIENT_SECRET);
  const server = await buildServer({
    config: testConfig(),
    budget: new InMemoryBudgetStore(),
    devices,
    provider: new MockProvider(),
    backups,
    now: () => Date.now(),
    logger: { level: "silent", redact: { paths: [], censor: "" } },
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  return { server, origin: server.listeningOrigin };
}

async function registerBackupDevice(pool: Pool, deviceId: string): Promise<void> {
  await pool.query(
    "INSERT INTO broker_device (device_id, label, secret_sha256) VALUES ($1, 'backup-test', $2)",
    [deviceId, sha256Hex(`integration-only-${deviceId}`)],
  );
}

suite("PostgreSQL security: least-privilege roles, schema guard and device enrolment", () => {
  let superuser: Pool;
  let owner: Pool;
  let app: Pool;
  let admin: Pool;
  // Idle-client errors from the server are recorded here and asserted in afterAll, so a dropped session is reported
  // with its message instead of as an unhandled error.
  const poolErrors: string[] = [];

  beforeAll(async () => {
    const base = BASE_URL ?? "";
    superuser = new Pool({ connectionString: withDatabase(base, "postgres"), max: 1 });
    await superuser.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await superuser.query(`CREATE DATABASE ${DB}`);
    await superuser.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'broker_security_app') THEN CREATE ROLE broker_security_app LOGIN; END IF; END $$",
    );
    await superuser.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'broker_security_admin') THEN CREATE ROLE broker_security_admin LOGIN; END IF; END $$",
    );
    owner = new Pool({ connectionString: withDatabase(base, DB), max: 2 });
    await migrate(owner, APP_ROLE, ADMIN_ROLE);
    app = new Pool({ connectionString: withDatabase(base, DB, APP_ROLE), max: 10 });
    admin = new Pool({ connectionString: withDatabase(base, DB, ADMIN_ROLE), max: 4 });
    for (const pool of [superuser, owner, app, admin]) {
      pool.on("error", (error: Error) => poolErrors.push(error.message));
    }
  });

  afterAll(async () => {
    // Close every pool before dropping, so no session is terminated by the drop itself.
    await Promise.all([app.end(), admin.end(), owner.end()]);
    await superuser.query(`DROP DATABASE IF EXISTS ${DB}`);
    await superuser.end();
    expect(poolErrors).toEqual([]);
  });

  it("migration is repeatable and the schema verifies", async () => {
    await migrate(owner, APP_ROLE, ADMIN_ROLE);
    await expect(verifySchema(owner)).resolves.toBeUndefined();
  });

  it("does not return an expired backup from PostgreSQL", async () => {
    const backups = new PostgresBackupStore(app);
    const deviceId = "33333333-3333-4333-8333-333333333333";
    const now = Date.now();
    try {
      await registerBackupDevice(owner, deviceId);
      await backups.put(deviceId, "v1.c2FsdA.aXY.Y2lwaGVy", now, now + 1_000);
      expect(await backups.get(deviceId, now + 1_000)).toBeNull();
    } finally {
      await backups.remove(deviceId);
      await owner.query("DELETE FROM broker_device WHERE device_id = $1", [deviceId]);
    }
  });

  it("deletes a PostgreSQL backup idempotently", async () => {
    const backups = new PostgresBackupStore(app);
    const deviceId = "44444444-4444-4444-8444-444444444444";
    const now = Date.now();
    try {
      await registerBackupDevice(owner, deviceId);
      await backups.put(deviceId, "v1.c2FsdA.aXY.Y2lwaGVy", now, now + 30 * 86_400_000);
      await backups.remove(deviceId);
      await expect(backups.get(deviceId, now)).resolves.toBeNull();
      await expect(backups.remove(deviceId)).resolves.toBeUndefined();
    } finally {
      await backups.remove(deviceId);
      await owner.query("DELETE FROM broker_device WHERE device_id = $1", [deviceId]);
    }
  });

  it("restores a PostgreSQL memory backup after a new broker app instance starts", async () => {
    const backups = new PostgresBackupStore(app);
    const ciphertext = "v1.c2FsdA.aXY.Y2lwaGVy";
    let first: Awaited<ReturnType<typeof createBackupBroker>> | undefined;
    let second: Awaited<ReturnType<typeof createBackupBroker>> | undefined;
    try {
      await registerBackupDevice(owner, TEST_DEVICE_ID);
      first = await createBackupBroker(backups);
      const saved = await fetch(`${first.origin}/v1/backup`, {
        method: "PUT",
        headers: { authorization: TEST_AUTH_HEADER, "content-type": "application/json" },
        body: JSON.stringify({ ciphertext, retentionDays: 30 }),
      });
      expect(saved.status).toBe(200);
      await first.server.close();
      first = undefined;

      second = await createBackupBroker(backups);
      const restored = await fetch(`${second.origin}/v1/backup`, {
        headers: { authorization: TEST_AUTH_HEADER },
      });
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({ ciphertext });
    } finally {
      await first?.server.close();
      await second?.server.close();
      await backups.remove(TEST_DEVICE_ID);
      await owner.query("DELETE FROM broker_device WHERE device_id = $1", [TEST_DEVICE_ID]);
    }
  });

  it("refuses the same role for the application and the admin", async () => {
    await expect(migrate(owner, APP_ROLE, APP_ROLE)).rejects.toThrow(/must be different/);
  });

  it("refuses a reserved or unsafe role name before any SQL runs", async () => {
    await expect(migrate(owner, "public", ADMIN_ROLE)).rejects.toBeInstanceOf(SchemaError);
    await expect(migrate(owner, 'x"; DROP TABLE broker_device; --', ADMIN_ROLE)).rejects.toThrow(
      /plain, non-reserved/,
    );
    await expect(verifySchema(owner)).resolves.toBeUndefined();
  });

  it("the application role can do its job: read and write the ledger and devices", async () => {
    await app.query(
      "INSERT INTO broker_budget_month (month) VALUES ('2030-01') ON CONFLICT DO NOTHING",
    );
    await expect(
      app.query("SELECT month FROM broker_budget_month WHERE month = '2030-01'"),
    ).resolves.toMatchObject({
      rowCount: 1,
    });
    await expect(app.query("SELECT device_id FROM broker_device")).resolves.toBeDefined();
  });

  it("the application role cannot create tables", async () => {
    await expect(app.query("CREATE TABLE attacker_table (x int)")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("the application role cannot delete ledger or device rows", async () => {
    await expect(app.query("DELETE FROM broker_device")).rejects.toThrow(/permission denied/);
    await expect(app.query("DELETE FROM broker_budget_month")).rejects.toThrow(/permission denied/);
  });

  it("the application role cannot drop, alter or re-grant the tables it uses", async () => {
    await expect(app.query("DROP TABLE broker_device")).rejects.toThrow(/must be owner/);
    await expect(app.query("ALTER TABLE broker_budget_month ADD COLUMN extra int")).rejects.toThrow(
      /must be owner/,
    );
    // PostgreSQL does not raise an error for a GRANT the role cannot make: it warns and grants nothing. So the test
    // checks the effective privilege afterwards, not the absence of an error.
    await app.query("GRANT ALL ON broker_device TO PUBLIC");
    const effective = await owner.query<{ can_delete: boolean }>(
      "SELECT has_table_privilege('public', 'broker_device', 'DELETE') AS can_delete",
    );
    expect(effective.rows[0]?.can_delete).toBe(false);
    await expect(app.query("DELETE FROM broker_device")).rejects.toThrow(/permission denied/);
  });

  it("the application role cannot issue enrolment codes or revoke devices", async () => {
    await expect(
      app.query(
        "INSERT INTO broker_enrolment_code (code_sha256, expires_at) VALUES ($1, now() + interval '10 minutes')",
        [sha256Hex("APP-FORGED-CODE-0001")],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.query("UPDATE broker_device SET revoked_at = NULL WHERE device_id = 'none'"),
    ).rejects.toThrow(/permission denied/);
  });

  it("the admin role can issue codes and revoke devices, but cannot delete or migrate", async () => {
    const store = new PostgresDeviceStore(admin);
    const code = await issueEnrolmentCode(store, Date.now());
    expect(code).toMatch(/^[A-Z2-9-]+$/);
    await expect(admin.query("DELETE FROM broker_device")).rejects.toThrow(/permission denied/);
    await expect(admin.query("CREATE TABLE admin_attacker (x int)")).rejects.toThrow(
      /permission denied/,
    );
    await expect(migrate(admin, APP_ROLE, ADMIN_ROLE)).rejects.toThrow(/owner role/);
  });

  it("the admin role cannot redeem its own code as a device", async () => {
    // Redemption is the application role's job. The admin role has no UPDATE on used_at.
    const store = new PostgresDeviceStore(admin);
    const code = await issueEnrolmentCode(store, Date.now());
    await expect(redeemEnrolment(store, code, "admin", Date.now())).rejects.toThrow(
      /permission denied/,
    );
  });

  it("a revoked device cannot be un-revoked, even by the owner", async () => {
    const store = new PostgresDeviceStore(admin);
    const enrolled = await redeemEnrolment(
      new PostgresDeviceStore(app),
      await issueEnrolmentCode(store, Date.now()),
      "unrevoke check",
      Date.now(),
    );
    expect(await store.revokeDevice(enrolled?.deviceId ?? "")).toBe(true);
    await expect(
      owner.query("UPDATE broker_device SET revoked_at = NULL WHERE device_id = $1", [
        enrolled?.deviceId ?? "",
      ]),
    ).rejects.toThrow(/revocation is permanent/);
  });

  it("a used enrolment code cannot be made usable again, even by the owner", async () => {
    const store = new PostgresDeviceStore(app);
    const code = await issueEnrolmentCode(new PostgresDeviceStore(admin), Date.now());
    expect(await redeemEnrolment(store, code, "single use", Date.now())).not.toBeNull();
    await expect(
      owner.query("UPDATE broker_enrolment_code SET used_at = NULL WHERE code_sha256 = $1", [
        sha256Hex(normalizeCode(code)),
      ]),
    ).rejects.toThrow(/single use/);
  });

  it("recorded spend cannot decrease, even by the owner", async () => {
    await owner.query(
      "INSERT INTO broker_budget_month (month, spent_paise) VALUES ('2030-02', 500) ON CONFLICT (month) DO UPDATE SET spent_paise = 500",
    );
    await expect(
      owner.query("UPDATE broker_budget_month SET spent_paise = 499 WHERE month = '2030-02'"),
    ).rejects.toThrow(/cannot decrease/);
    await expect(
      app.query("UPDATE broker_budget_month SET spent_paise = 0 WHERE month = '2030-02'"),
    ).rejects.toThrow(/cannot decrease/);
  });

  it("the ledger refuses a negative spend value, even from the application role", async () => {
    // The decrease trigger runs first for a value below the recorded spend; the CHECK constraint covers the rest.
    await expect(
      app.query("UPDATE broker_budget_month SET spent_paise = -1 WHERE month = '2030-01'"),
    ).rejects.toThrow(/cannot decrease|check constraint/);
  });

  it("the schema guard refuses a database missing a ledger table, and names the table", async () => {
    await owner.query("DROP TABLE broker_enrolment_code");
    await expect(verifySchema(owner)).rejects.toThrow(/broker_enrolment_code/);
    await migrate(owner, APP_ROLE, ADMIN_ROLE);
    await expect(verifySchema(owner)).resolves.toBeUndefined();
  });

  it("spend continuity: a ledger restored to an older state is refused against the real anchor", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-continuity-"));
    try {
      const anchor = new FileAnchor(join(dir, "anchor.json"));
      const store = new PostgresBudgetStore(owner);
      const month = new Date().toISOString().slice(0, 7);
      await owner.query("DELETE FROM broker_reservation");
      await owner.query("DELETE FROM broker_budget_month");
      await owner.query("INSERT INTO broker_budget_month (month, spent_paise) VALUES ($1, 500)", [
        month,
      ]);
      await anchor.write({ [month]: 500 });
      await expect(checkContinuity(store, anchor, Date.now())).resolves.toBe(false);

      // A restore of an older backup: the same month with less spend. Only the owner can do this, and the trigger
      // refuses a decrease, so the test simulates the restore by truncating and re-inserting.
      await owner.query("TRUNCATE broker_reservation, broker_budget_month");
      await owner.query("INSERT INTO broker_budget_month (month, spent_paise) VALUES ($1, 120)", [
        month,
      ]);
      const error = await checkContinuity(store, anchor, Date.now()).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(AnchorError);
      expect((error as AnchorError).code).toBe("ROLLED_BACK");

      // The owner's documented recovery: raise recorded spend to the anchored value, which the trigger allows.
      await owner.query("UPDATE broker_budget_month SET spent_paise = 500 WHERE month = $1", [
        month,
      ]);
      await expect(checkContinuity(store, anchor, Date.now())).resolves.toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses the persistent ledger when its external anchor file is lost", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-lost-anchor-"));
    const anchorPath = join(dir, "anchor.json");
    try {
      const anchor = new FileAnchor(anchorPath);
      const store = new PostgresBudgetStore(owner);
      const month = new Date().toISOString().slice(0, 7);
      await owner.query("DELETE FROM broker_reservation");
      await owner.query("DELETE FROM broker_budget_month");
      await owner.query("INSERT INTO broker_budget_month (month, spent_paise) VALUES ($1, 500)", [
        month,
      ]);
      await anchor.write({ [month]: 500 });
      await expect(checkContinuity(store, anchor, Date.now())).resolves.toBe(false);

      rmSync(anchorPath);
      await expect(checkContinuity(store, anchor, Date.now())).rejects.toMatchObject({
        code: "NO_ANCHOR_WITH_SPEND",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the application role cannot insert a device directly, only through the redemption function", async () => {
    await expect(
      app.query(
        "INSERT INTO broker_device (device_id, label, secret_sha256) VALUES ($1, 'forged', $2)",
        ["99999999-9999-4999-8999-999999999999", sha256Hex("forged")],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("a direct edit of reserved spend that does not match open reservations is refused at commit", async () => {
    await owner.query("DELETE FROM broker_reservation WHERE month = '2030-03'");
    await owner.query(
      "INSERT INTO broker_budget_month (month, reserved_paise) VALUES ('2030-03', 0) ON CONFLICT (month) DO UPDATE SET reserved_paise = 0",
    );
    await expect(
      owner.query("UPDATE broker_budget_month SET reserved_paise = 999 WHERE month = '2030-03'"),
    ).rejects.toThrow(/reserved spend does not match/);
    await expect(
      app.query("UPDATE broker_budget_month SET reserved_paise = 999 WHERE month = '2030-03'"),
    ).rejects.toThrow(/reserved spend does not match/);
  });

  it("the application role cannot reopen a settled reservation or change its charged amount", async () => {
    await owner.query(
      "INSERT INTO broker_budget_month (month) VALUES ('2030-05') ON CONFLICT DO NOTHING",
    );
    // A reservation is created open and settled through the normal path, which charges the spend in the database.
    // The budget row and the open reservation commit together, as the application writes them.
    await owner.query(
      "BEGIN; INSERT INTO broker_budget_month (month, reserved_paise) VALUES ('2030-05', 10) ON CONFLICT (month) DO UPDATE SET reserved_paise = EXCLUDED.reserved_paise; INSERT INTO broker_reservation (reservation_id, client_id, month, amount_paise, state) VALUES ('closed-final-1', 'app-1', '2030-05', 10, 'reserved'); COMMIT",
    );
    await owner.query(
      "UPDATE broker_reservation SET state = 'settled', actual_paise = 10, closed_at = now() WHERE reservation_id = 'closed-final-1'",
    );
    await expect(
      app.query(
        "UPDATE broker_reservation SET state = 'reserved' WHERE reservation_id = 'closed-final-1'",
      ),
    ).rejects.toThrow(/closed reservation cannot change/);
    await expect(
      app.query(
        "UPDATE broker_reservation SET actual_paise = 0 WHERE reservation_id = 'closed-final-1'",
      ),
    ).rejects.toThrow(/closed reservation cannot change/);
  });

  it("the application role cannot create temporary tables, so a session cannot shadow a ledger table", async () => {
    await expect(
      app.query("CREATE TEMP TABLE broker_enrolment_code (code_sha256 text)"),
    ).rejects.toThrow(/permission denied/);
    // The superuser is not bound by grants and is used only by the owner migration path, so the check is on the grant.
    const grant = await owner.query<{ can_temp: boolean }>(
      "SELECT has_database_privilege('public', current_database(), 'TEMP') AS can_temp",
    );
    expect(grant.rows[0]?.can_temp).toBe(false);
  });

  it("the genesis is recorded once, and the application role cannot write it directly", async () => {
    // The owner clears the marker so the first call is a real first call, not a call after the migration backfill.
    await owner.query("DELETE FROM broker_ledger_genesis");
    const first = await app.query<{ recorded: boolean }>(
      "SELECT broker_record_genesis() AS recorded",
    );
    expect(first.rows[0]?.recorded).toBe(true);
    const second = await app.query<{ recorded: boolean }>(
      "SELECT broker_record_genesis() AS recorded",
    );
    expect(second.rows[0]?.recorded).toBe(false);
    const seen = await app.query<{ recorded: boolean }>(
      "SELECT broker_genesis_recorded() AS recorded",
    );
    expect(seen.rows[0]?.recorded).toBe(true);
    await expect(app.query("INSERT INTO broker_ledger_genesis (id) VALUES (2)")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("the schema guard passes when the broker runs it as the application role, which has no rights on every table", async () => {
    await expect(verifySchema(app)).resolves.toBeUndefined();
  });

  it("the schema guard refuses a database whose immutability trigger was dropped or disabled", async () => {
    await owner.query("DROP TRIGGER broker_budget_spend_monotonic ON broker_budget_month");
    await expect(verifySchema(owner)).rejects.toThrow(/broker_budget_spend_monotonic/);
    await migrate(owner, APP_ROLE, ADMIN_ROLE);
    await expect(verifySchema(owner)).resolves.toBeUndefined();
  });

  it("the schema guard refuses a disabled trigger", async () => {
    await owner.query(
      "ALTER TABLE broker_device DISABLE TRIGGER broker_device_revocation_permanent",
    );
    await expect(verifySchema(owner)).rejects.toThrow(/broker_device_revocation_permanent/);
    await owner.query(
      "ALTER TABLE broker_device ENABLE TRIGGER broker_device_revocation_permanent",
    );
    await expect(verifySchema(owner)).resolves.toBeUndefined();
  });

  it("the schema guard refuses a table that lost a required column", async () => {
    await owner.query("ALTER TABLE broker_device DROP COLUMN label");
    await expect(verifySchema(owner)).rejects.toThrow(/broker_device\.label/);
    // migrate() creates tables only if missing, so the test restores the column itself.
    await owner.query(
      "ALTER TABLE broker_device ADD COLUMN label text NOT NULL DEFAULT 'restored'",
    );
    await expect(verifySchema(owner)).resolves.toBeUndefined();
  });

  it("a code redeemed by many concurrent requests registers exactly one device", async () => {
    const store = new PostgresDeviceStore(app);
    const code = await issueEnrolmentCode(new PostgresDeviceStore(admin), Date.now());
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        redeemEnrolment(store, code, `race ${String(index)}`, Date.now()),
      ),
    );
    expect(attempts.filter((result) => result !== null)).toHaveLength(1);
  });

  it("a replayed code is refused once it has been used", async () => {
    const store = new PostgresDeviceStore(app);
    const code = await issueEnrolmentCode(new PostgresDeviceStore(admin), Date.now());
    expect(await redeemEnrolment(store, code, "first", Date.now())).not.toBeNull();
    expect(await redeemEnrolment(store, code, "replay", Date.now())).toBeNull();
  });

  it("an unknown code and an expired code look the same: both refused with no detail", async () => {
    const store = new PostgresDeviceStore(app);
    const adminStore = new PostgresDeviceStore(admin);
    await adminStore.addEnrolmentCode(sha256Hex("EXPIRED0EXPIRED0"), Date.now() - 1000);
    expect(await redeemEnrolment(store, "EXPI-RED0-EXPI-RED0", "late", Date.now())).toBeNull();
    expect(await redeemEnrolment(store, "NEVR-ISSU-EDNO-PEXI", "guess", Date.now())).toBeNull();
  });

  it("authenticates a freshly enrolled device, and stops it at once when revoked", async () => {
    const store = new PostgresDeviceStore(app);
    const adminStore = new PostgresDeviceStore(admin);
    const code = await issueEnrolmentCode(adminStore, Date.now());
    const enrolled = await redeemEnrolment(store, code, "owner phone", Date.now());
    expect(enrolled).not.toBeNull();
    const header = `Bearer ${enrolled?.deviceId ?? ""}.${enrolled?.deviceSecret ?? ""}`;
    expect(await authenticateDevice(header, store)).toBe(enrolled?.deviceId);

    expect(await adminStore.revokeDevice(enrolled?.deviceId ?? "")).toBe(true);
    expect(await authenticateDevice(header, store)).toBeNull();
  });

  it("a stored device-secret hash cannot be used directly as a credential", async () => {
    const store = new PostgresDeviceStore(app);
    const enrolled = await redeemEnrolment(
      store,
      await issueEnrolmentCode(new PostgresDeviceStore(admin), Date.now()),
      "hash-only",
      Date.now(),
    );
    const row = await owner.query<{ secret_sha256: string }>(
      "SELECT secret_sha256 FROM broker_device WHERE device_id = $1",
      [enrolled?.deviceId ?? ""],
    );
    const hash = row.rows[0]?.secret_sha256 ?? "";
    expect(hash).toBe(sha256Hex(enrolled?.deviceSecret ?? ""));
    expect(hash).not.toBe(enrolled?.deviceSecret);
    // Presenting the stored hash as the secret must not authenticate.
    expect(
      await authenticateDevice(`Bearer ${enrolled?.deviceId ?? ""}.${hash}`, store),
    ).toBeNull();
  });
});
