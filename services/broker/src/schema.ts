import type { Pool } from "pg";

/**
 * Ledger schema and role setup. Three roles, each with only the rights it needs:
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
  "broker_ledger_genesis",
  "broker_memory_backup",
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
    "dev_test",
  ],
  broker_device: ["device_id", "label", "secret_sha256", "created_at", "revoked_at"],
  broker_enrolment_code: ["code_sha256", "created_at", "expires_at", "used_at"],
  broker_ledger_genesis: ["id", "created_at"],
  broker_memory_backup: ["device_id", "ciphertext", "updated_at", "expires_at"],
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS broker_budget_month (
  month text PRIMARY KEY CHECK (month ~ '^([0-9]{4}-[0-9]{2}|DEV-TEST-CUMULATIVE)$'),
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
  closed_at timestamptz,
  dev_test boolean NOT NULL DEFAULT false
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
-- One encrypted memory backup per device (OWNER-DECISION-004). The broker stores opaque ciphertext and deletes it at expiry.
CREATE TABLE IF NOT EXISTS broker_memory_backup (
  device_id text PRIMARY KEY REFERENCES broker_device (device_id) ON DELETE CASCADE,
  ciphertext text NOT NULL CHECK (char_length(ciphertext) BETWEEN 1 AND 1000000),
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > updated_at)
);
-- One row, written once, when the owner starts an empty ledger with BROKER_LEDGER_GENESIS. It records that a ledger
-- has started, so a later start with a missing anchor refuses instead of starting a new ledger.
CREATE TABLE IF NOT EXISTS broker_ledger_genesis (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION broker_forbid_unrevoke() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
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

CREATE OR REPLACE FUNCTION broker_forbid_code_reuse() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
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

CREATE OR REPLACE FUNCTION broker_forbid_spend_decrease() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
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
  "broker_budget_reserved_consistent",
  "broker_reservation_reserved_consistent",
  "broker_reservation_closed_final",
  "broker_reservation_settles_buckets",
  "broker_reservation_opens_only",
  "broker_quota_monotonic",
];

/**
 * The database, not the application, moves money between buckets. When a reservation closes (reserved to settled or
 * released), this trigger releases its reserved amount and records the actual cost in every bucket it holds, in the
 * same statement as the state change. The application can no longer close a reservation without its spend being
 * recorded. A settled reservation must carry a non-negative actual cost, and a released one must carry none.
 */
const SETTLEMENT_SQL = `
CREATE OR REPLACE FUNCTION broker_apply_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  charged bigint;
  touched integer;
BEGIN
  IF OLD.state = 'reserved' AND NEW.state = 'reserved'
    AND (NEW.actual_paise IS NOT NULL OR NEW.closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'an open reservation carries no actual cost or close time';
  END IF;
  IF OLD.state = 'reserved' AND NEW.state IN ('settled', 'released') THEN
    IF NEW.state = 'settled' THEN
      IF NEW.actual_paise IS NULL OR NEW.actual_paise < 0 THEN
        RAISE EXCEPTION 'a settled reservation needs a non-negative actual cost';
      END IF;
      charged := NEW.actual_paise;
    ELSE
      IF NEW.actual_paise IS NOT NULL THEN
        RAISE EXCEPTION 'a released reservation carries no actual cost';
      END IF;
      charged := 0;
    END IF;
    UPDATE broker_budget_month
      SET reserved_paise = reserved_paise - OLD.amount_paise, spent_paise = spent_paise + charged
      WHERE month = OLD.month;
    GET DIAGNOSTICS touched = ROW_COUNT;
    IF touched <> 1 THEN
      RAISE EXCEPTION 'no budget row for the reservation month';
    END IF;
    IF OLD.dev_test THEN
      UPDATE broker_budget_month
        SET reserved_paise = reserved_paise - OLD.amount_paise, spent_paise = spent_paise + charged
        WHERE month = 'DEV-TEST-CUMULATIVE';
      GET DIAGNOSTICS touched = ROW_COUNT;
      IF touched <> 1 THEN
        RAISE EXCEPTION 'no development-test budget row';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_reservation_settles_buckets ON broker_reservation;
CREATE TRIGGER broker_reservation_settles_buckets BEFORE UPDATE ON broker_reservation
  FOR EACH ROW EXECUTE FUNCTION broker_apply_settlement();
-- A reservation can only be created open. Inserting one already settled would move no money, so it is refused here.
CREATE OR REPLACE FUNCTION broker_require_open_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.state <> 'reserved' OR NEW.actual_paise IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a reservation must be created open, without an actual cost or a close time';
  END IF;
  IF NEW.month = 'DEV-TEST-CUMULATIVE' THEN
    RAISE EXCEPTION 'the development-test bucket cannot be a reservation month';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_reservation_opens_only ON broker_reservation;
CREATE TRIGGER broker_reservation_opens_only BEFORE INSERT ON broker_reservation
  FOR EACH ROW EXECUTE FUNCTION broker_require_open_insert();
-- The daily request count only rises. Without this, a caller with UPDATE on the count could reset its own daily quota.
CREATE OR REPLACE FUNCTION broker_quota_monotonic() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.requests < OLD.requests THEN
    RAISE EXCEPTION 'the daily request count cannot decrease';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_quota_monotonic ON broker_daily_quota;
CREATE TRIGGER broker_quota_monotonic BEFORE UPDATE ON broker_daily_quota
  FOR EACH ROW EXECUTE FUNCTION broker_quota_monotonic();
`;

/**
 * A reservation moves once: from reserved to settled or released. After that its state, actual spend and close time are
 * fixed, so the application role cannot reopen a billed call or release one that was charged.
 */
const CLOSED_FINAL_SQL = `
CREATE OR REPLACE FUNCTION broker_forbid_reservation_reopen() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF OLD.state <> 'reserved'
    AND (NEW.state, NEW.actual_paise, NEW.closed_at) IS DISTINCT FROM (OLD.state, OLD.actual_paise, OLD.closed_at) THEN
    RAISE EXCEPTION 'a closed reservation cannot change';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS broker_reservation_closed_final ON broker_reservation;
CREATE TRIGGER broker_reservation_closed_final BEFORE UPDATE ON broker_reservation
  FOR EACH ROW EXECUTE FUNCTION broker_forbid_reservation_reopen();
`;

/**
 * Records that the ledger has started. The application role can only call these functions; it cannot write the table
 * directly. recordGenesis returns true only for the first call.
 */
const GENESIS_SQL = `
CREATE OR REPLACE FUNCTION broker_record_genesis() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE inserted integer;
BEGIN
  INSERT INTO broker_ledger_genesis (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted = 1;
END
$fn$;
CREATE OR REPLACE FUNCTION broker_genesis_recorded() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT EXISTS (SELECT 1 FROM broker_ledger_genesis);
$fn$;
REVOKE ALL ON FUNCTION broker_record_genesis() FROM PUBLIC;
REVOKE ALL ON FUNCTION broker_genesis_recorded() FROM PUBLIC;
-- A ledger that already has spend records has started. Mark it so a later missing anchor refuses, even for a database
-- that was started before this marker existed.
INSERT INTO broker_ledger_genesis (id) SELECT 1 WHERE EXISTS (SELECT 1 FROM broker_budget_month) ON CONFLICT (id) DO NOTHING;
`;

const REDEEM_SQL = `
CREATE OR REPLACE FUNCTION broker_redeem_enrolment(p_code_sha256 text, p_device_id text, p_label text, p_secret_sha256 text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE redeemed text;
BEGIN
  UPDATE broker_enrolment_code SET used_at = now()
    WHERE code_sha256 = p_code_sha256 AND used_at IS NULL AND expires_at > now()
    RETURNING code_sha256 INTO redeemed;
  IF redeemed IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO broker_device (device_id, label, secret_sha256) VALUES (p_device_id, p_label, p_secret_sha256);
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION broker_redeem_enrolment(text, text, text, text) FROM PUBLIC;
`;

/**
 * Recorded reserved spend must equal the open reservations of its month. Checked at commit, so the reserve, settle and
 * release statements may run in any order inside one transaction. A direct edit of reserved_paise therefore fails.
 * Recorded spend is not checked here, because the owner's documented recovery raises it to the anchored value.
 */
const RESERVED_SQL = `
CREATE OR REPLACE FUNCTION broker_check_reserved() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  dev_reservation boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'broker_reservation' THEN
    dev_reservation := NEW.dev_test;
  END IF;
  -- Monthly bucket: every reservation of the month counts against it, development-test ones included.
  IF NEW.month <> 'DEV-TEST-CUMULATIVE' AND EXISTS (
    SELECT 1 FROM broker_budget_month b
    WHERE b.month = NEW.month
      AND b.reserved_paise <> (
        SELECT COALESCE(SUM(r.amount_paise), 0) FROM broker_reservation r
        WHERE r.month = NEW.month AND r.state = 'reserved')
  ) THEN
    RAISE EXCEPTION 'reserved spend does not match the open reservations';
  END IF;
  -- Development-test bucket: only reservations flagged dev_test count against it.
  IF (NEW.month = 'DEV-TEST-CUMULATIVE' OR dev_reservation) AND EXISTS (
    SELECT 1 FROM broker_budget_month b
    WHERE b.month = 'DEV-TEST-CUMULATIVE'
      AND b.reserved_paise <> (
        SELECT COALESCE(SUM(r.amount_paise), 0) FROM broker_reservation r
        WHERE r.dev_test AND r.state = 'reserved')
  ) THEN
    RAISE EXCEPTION 'development-test reserved spend does not match the open reservations';
  END IF;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS broker_budget_reserved_consistent ON broker_budget_month;
CREATE CONSTRAINT TRIGGER broker_budget_reserved_consistent AFTER INSERT OR UPDATE ON broker_budget_month
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION broker_check_reserved();
DROP TRIGGER IF EXISTS broker_reservation_reserved_consistent ON broker_reservation;
CREATE CONSTRAINT TRIGGER broker_reservation_reserved_consistent AFTER INSERT OR UPDATE ON broker_reservation
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION broker_check_reserved();
`;

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
    await client.query(REDEEM_SQL);
    await client.query(RESERVED_SQL);
    await client.query(CLOSED_FINAL_SQL);
    await client.query(SETTLEMENT_SQL);
    await client.query(GENESIS_SQL);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    // Temporary tables would shadow the ledger tables for a session; no role needs them.
    await client.query(
      "DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$",
    );
    await client.query(`REVOKE ALL ON ${LEDGER_TABLES.join(", ")} FROM ${app}, ${admin}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${app}, ${admin}`);
    // Application role: record reservations and spend; read devices and codes; redeem codes through a function.
    await client.query(
      `GRANT SELECT ON broker_budget_month, broker_daily_quota, broker_reservation, broker_device, broker_enrolment_code TO ${app}`,
    );
    await client.query(
      `GRANT INSERT ON broker_budget_month, broker_daily_quota, broker_reservation TO ${app}`,
    );
    // Device registration goes through broker_redeem_enrolment, which runs as the owner. The app role cannot insert
    // a device directly.
    await client.query(
      `GRANT EXECUTE ON FUNCTION broker_redeem_enrolment(text, text, text, text) TO ${app}`,
    );
    await client.query(
      `GRANT EXECUTE ON FUNCTION broker_record_genesis(), broker_genesis_recorded() TO ${app}`,
    );
    await client.query(
      `GRANT UPDATE (spent_paise, reserved_paise) ON broker_budget_month TO ${app}`,
    );
    await client.query(`GRANT UPDATE (requests) ON broker_daily_quota TO ${app}`);
    await client.query(
      `GRANT UPDATE (state, actual_paise, closed_at) ON broker_reservation TO ${app}`,
    );
    await client.query(`GRANT UPDATE (used_at) ON broker_enrolment_code TO ${app}`);
    await client.query(
      `GRANT SELECT, INSERT, DELETE, UPDATE (ciphertext, updated_at, expires_at) ON broker_memory_backup TO ${app}`,
    );
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
    "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O', 'A') AND tgname = ANY($1)",
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
    // The catalog, not information_schema: information_schema lists only the columns the current role may use, so the
    // application role would see no columns of a table it has no privilege on, and the schema would look missing.
    const columns = await pool.query<{ column_name: string }>(
      "SELECT a.attname AS column_name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid " +
        "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = $1 " +
        "AND a.attnum > 0 AND NOT a.attisdropped",
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
