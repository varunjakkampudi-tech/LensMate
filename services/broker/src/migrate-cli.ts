import { Pool } from "pg";
import { readEnvValue } from "./env.js";
import { migrate } from "./schema.js";

/**
 * `node dist/migrate-cli.js`. Runs as the owner role (BROKER_MIGRATOR_DATABASE_URL or _FILE) and gives the application
 * role (BROKER_APP_ROLE) and the admin role (BROKER_ADMIN_ROLE) their minimum rights. Safe to run more than once.
 * Connection strings are never printed.
 */
async function main(): Promise<void> {
  const url = readEnvValue(process.env, "BROKER_MIGRATOR_DATABASE_URL");
  const appRole = process.env.BROKER_APP_ROLE?.trim();
  const adminRole = process.env.BROKER_ADMIN_ROLE?.trim();
  if (url === undefined) {
    throw new Error(
      "BROKER_MIGRATOR_DATABASE_URL or BROKER_MIGRATOR_DATABASE_URL_FILE is required",
    );
  }
  if (appRole === undefined || appRole === "" || adminRole === undefined || adminRole === "") {
    throw new Error("BROKER_APP_ROLE and BROKER_ADMIN_ROLE are required");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(pool, appRole, adminRole);
    process.stdout.write("migration complete\n");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "migration failed";
  process.stderr.write(`migration failed: ${name}: ${message}\n`);
  process.exit(1);
});
