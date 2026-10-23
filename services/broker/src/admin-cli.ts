import { Pool } from "pg";
import { runAdmin } from "./admin.js";
import { readEnvValue } from "./env.js";
import { PostgresDeviceStore } from "./devices.js";

/**
 * `node dist/admin-cli.js <command>`. Uses the admin role (BROKER_ADMIN_DATABASE_URL or _FILE), which can issue
 * enrolment codes and revoke devices, and nothing else. It is never given to the broker's own containers.
 */
async function main(): Promise<void> {
  const url = readEnvValue(process.env, "BROKER_ADMIN_DATABASE_URL");
  if (url === undefined) {
    throw new Error("BROKER_ADMIN_DATABASE_URL or BROKER_ADMIN_DATABASE_URL_FILE is required");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const output = await runAdmin(process.argv.slice(2), new PostgresDeviceStore(pool), Date.now());
    process.stdout.write(output);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`admin command failed: ${name}\n`);
  process.exit(1);
});
