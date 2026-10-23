import type { Pool } from "pg";

/**
 * Ledger schema and role setup (BLOCKER-006 items 1, 3, 6 and 7). Three roles, each with only the rights it needs:
 * - the owner (migrator) role creates tables and grants rights. It runs `pnpm migrate` only, never the broker;
 * - the application role (BROKER_APP_ROLE) records reservations and spend, reads devices, registers devices and redeems
 *   enrolment codes. It cannot issue codes, revoke devices, delete rows, change the schema, or lower recorded spend;
 * - the admin role (BROKER_ADMIN_ROLE) issues enrolment codes and revokes devices. It runs from the server only.
 * Immutability triggers stop a revocation or a used code from being undone, and stop recorded spend from decreasing,
 * for every application and admin statement. The table owner can still drop a trigger, so verifySchema checks that each
 * trigger exists and is enabled at start-up. Amounts are integer paise. Timestamps use the database clock.
 */
const LEDGER_TABLES = [
  "broker_budget_month",
  "broker_daily_quota",
  "broker_reservation",
  "broker_device",
  "broker_enrolment_code",
] as const;

/** Columns each table must have. Checked at start-up, so a drifted schema stops the broker. */
const REQUIRED_COLUMNS: Readonly<Record<(typeof LEDGER_TABLES)[number], readonly string[]>> = {
  broker_budget_month: ["month", "spent_paise", "reserved_paise"],
  broker_daily_quota: ["client_id", "day", "requests"],
  broker_reservation: [
    "reservation_id",
    "client_id",
    "month",
    "amount_paise",
    "actual_paise",
    "state",
    "closed_at",
  ],
  broker_device: ["device_id", "label", "secret_sha256", "created_at", "revoked_at"],
  broker_enrolment_code: ["code_sha256", "created_at", "expires_at", "used_at"],
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS broker_budget_month (
  month text PRIMARY KEY CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  spent_paise bigint NOT NULL DEFAULT 0 CHECK (spent_paise >= 0),
  reserved_paise bigint NOT NULL DEFAULT 0 CHECK (reserved_paise >= 0)
);
CREATE TABLE IF NOT EXISTS broker_daily_quota (
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 64),
  day text NOT NULL CHECK (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  PRIMARY KEY (client_id, day)
);
CREATE TABLE IF NOT EXISTS broker_reservation (
  reservation_id text PRIMARY KEY CHECK (char_length(reservation_id) BETWEEN 1 AND 128),
  client_id text NOT NULL,
  month text NOT NULL REFERENCES broker_budget_month(month),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  actual_paise bigint CHECK (actual_paise IS NULL OR actual_paise >= 0),
  state text NOT NULL CHECK (state IN ('reserved', 'settled', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS broker_device (
  device_id text PRIMARY KEY CHECK (char_length(device_id) BETWEEN 1 AND 64),
  label text NOT NULL CHECK (label ~ '^[A-Za-z0-9 ._-]{1,64}$'),
  secret_sha256 text NOT NULL CHECK (secret_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS broker_enrolment_code (
  code_sha256 text PRIMARY KEY CHECK (code_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE OR REPLACE FUNCTION broker_forbid_unrevoke() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'revocation is permanent';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_device_revocation_permanent ON broker_device;
CREATE TRIGGER broker_device_revocation_permanent BEFORE UPDATE ON broker_device
  FOR EACH ROW EXECUTE FUNCTION broker_forbid_unrevoke();

CREATE OR REPLACE FUNCTION broker_forbid_code_reuse() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'an enrolment code is single use';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_enrolment_code_single_use ON broker_enrolment_code;
CREATE TRIGGER broker_enrolment_code_single_use BEFORE UPDATE ON broker_enrolment_code
  FOR EACH ROW EXECUTE FUNCTION broker_forbid_code_reuse();

CREATE OR REPLACE FUNCTION broker_forbid_spend_decrease() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.spent_paise < OLD.spent_paise THEN
    RAISE EXCEPTION 'recorded spend cannot decrease';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_budget_spend_monotonic ON broker_budget_month;
CREATE TRIGGER broker_budget_spend_monotonic BEFORE UPDATE ON broker_budget_month
  FOR EACH ROW EXECUTE FUNCTION broker_forbid_spend_decrease();
`;

/** Immutability triggers that verifySchema requires to exist and be enabled. */
const TRIGGERS = [
  "broker_device_revocation_permanent",
  "broker_enrolment_code_single_use",
  "broker_budget_spend_monotonic",
];

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const RESERVED_ROLE = /^(public|pg_.*|information_schema)$/;

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

/** Checks a role name and returns it quoted. Identifiers cannot be bound as parameters, so this check is required. */
function quoteRole(name: string, label: string): string {
  if (!ROLE_NAME.test(name) || RESERVED_ROLE.test(name)) {
    throw new SchemaError(`${label} must be a plain, non-reserved lower-case role name`);
  }
  return `"${name}"`;
}

/**
 * Creates or updates the schema and gives each role its minimum rights. Run by the owner role only. Each run first
 * drops any broader grant left by an earlier version, then applies the current set.
 */
export async function migrate(pool: Pool, appRole: string, adminRole: string): Promise<void> {
  const app = quoteRole(appRole, "BROKER_APP_ROLE");
  const admin = quoteRole(adminRole, "BROKER_ADMIN_ROLE");
  if (app === admin) {
    throw new SchemaError("the application and admin roles must be different");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const who = await client.query<{ name: string }>("SELECT current_user AS name");
    const owner = `"${who.rows[0]?.name ?? ""}"`;
    if (owner === app || owner === admin) {
      throw new SchemaError(
        "the migration must run as the owner role, not as the application or admin role",
      );
    }
    await client.query(SCHEMA_SQL);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(`REVOKE ALL ON ${LEDGER_TABLES.join(", ")} FROM ${app}, ${admin}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${app}, ${admin}`);
    // Application role: record reservations and spend; read devices and codes; register devices; redeem codes.
    await client.query(
      `GRANT SELECT ON broker_budget_month, broker_daily_quota, broker_reservation, broker_device, broker_enrolment_code TO ${app}`,
    );
    await client.query(
      `GRANT INSERT ON broker_budget_month, broker_daily_quota, broker_reservation, broker_device TO ${app}`,
    );
    await client.query(
      `GRANT UPDATE (spent_paise, reserved_paise) ON broker_budget_month TO ${app}`,
    );
    await client.query(`GRANT UPDATE (requests) ON broker_daily_quota TO ${app}`);
    await client.query(
      `GRANT UPDATE (state, actual_paise, closed_at) ON broker_reservation TO ${app}`,
    );
    await client.query(`GRANT UPDATE (used_at) ON broker_enrolment_code TO ${app}`);
    // Admin role: issue enrolment codes and revoke devices. Used from the server only.
    await client.query(`GRANT SELECT ON broker_device TO ${admin}`);
    await client.query(`GRANT INSERT ON broker_enrolment_code TO ${admin}`);
    await client.query(`GRANT UPDATE (revoked_at) ON broker_device TO ${admin}`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refuses to run against a database that lacks a ledger table or a required column. Used at start-up, so a missing
 * or drifted ledger stops the broker before any provider call can be made.
 */
export async function verifySchema(pool: Pool): Promise<void> {
  const problems: string[] = [];
  const triggers = await pool.query<{ tgname: string }>(
    "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname = ANY($1)",
    [TRIGGERS],
  );
  const enabled = new Set(triggers.rows.map((row) => row.tgname));
  for (const name of TRIGGERS) {
    if (!enabled.has(name)) {
      problems.push(`missing or disabled trigger ${name}`);
    }
  }
  for (const table of LEDGER_TABLES) {
    const check = await pool.query<{ name: string | null }>("SELECT to_regclass($1) AS name", [
      `public.${table}`,
    ]);
    if (check.rows[0]?.name === null) {
      problems.push(`missing table ${table}`);
      continue;
    }
    const columns = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [table],
    );
    const present = new Set(columns.rows.map((row) => row.column_name));
    for (const column of REQUIRED_COLUMNS[table]) {
      if (!present.has(column)) {
        problems.push(`missing column ${table}.${column}`);
      }
    }
  }
  if (problems.length > 0) {
    throw new SchemaError(`ledger schema incomplete: ${problems.join("; ")}`);
  }
}
