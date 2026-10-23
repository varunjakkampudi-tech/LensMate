import { Pool } from "pg";
import {
  authenticateDevice,
  issueEnrolmentCode,
  normalizeCode,
  PostgresDeviceStore,
  redeemEnrolment,
  sha256Hex,
} from "./devices.js";
import { migrate, SchemaError, verifySchema } from "./schema.js";

/**
 * PostgreSQL security tests (BLOCKER-006 items 1, 3 and 4). They run as the application role and the admin role, not
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
