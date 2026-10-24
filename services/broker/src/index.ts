import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { InMemoryBudgetStore, type BudgetStore } from "./budget.js";
import { InMemoryDeviceStore, PostgresDeviceStore, type DeviceStore } from "./devices.js";
import { PostgresBudgetStore } from "./postgres-budget.js";
import { OpenRouterProvider, MockProvider, type ChatProvider } from "./provider.js";
import { buildServer } from "./server.js";
import { InMemoryBackupStore, PostgresBackupStore, type BackupStore } from "./backup.js";
import { verifySchema } from "./schema.js";
import {
  AnchoredBudgetStore,
  checkContinuity,
  checkRevocations,
  syncRevocations,
  type LedgerMarker,
  FileAnchor,
  monthOf,
  probeAnchor,
  recentMonths,
} from "./ledger-anchor.js";

/** Open reservations older than this are charged at worst case by the reaper. It is well past any provider timeout. */
const REAP_AFTER_SECONDS = 300;
const REAP_EVERY_MS = 60_000;

/**
 * Broker entry point. Configuration comes from the server environment only. The broker never runs migrations: those
 * are run once by the owner role (`pnpm migrate`). If a database is configured, the schema must be complete before
 * the broker starts, so a missing or half-migrated ledger stops it instead of letting it run unaccounted.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);

  let budget: BudgetStore;
  let devices: DeviceStore;
  let backups: BackupStore;
  let pool: Pool | undefined;
  let reaper: (() => Promise<number>) | undefined;
  if (config.databaseUrl !== undefined) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 30_000 });
    // An idle connection error must not crash the process. The pool discards the connection and reconnects.
    pool.on("error", () => {
      process.stderr.write("ledger connection lost; reconnecting\n");
    });
    await verifySchema(pool);
    const store = new PostgresBudgetStore(pool);
    // Refuses to start when recorded spend is below what the broker itself anchored (a restored or altered ledger).
    // The owner must raise recorded spend to the anchored value, or to the provider-billed amount if higher.
    const anchor = new FileAnchor(config.ledgerAnchorPath ?? "", { requireMount: true });
    await probeAnchor(anchor);
    // The database's genesis record: once the ledger has started, a missing anchor always refuses.
    const ledgerPool: Pool = pool;
    const genesisMarker: LedgerMarker = {
      isRecorded: async () =>
        (
          await ledgerPool.query<{ recorded: boolean }>(
            "SELECT broker_genesis_recorded() AS recorded",
          )
        ).rows[0]?.recorded === true,
      record: async () =>
        (
          await ledgerPool.query<{ recorded: boolean }>(
            "SELECT broker_record_genesis() AS recorded",
          )
        ).rows[0]?.recorded === true,
    };
    await checkContinuity(store, anchor, Date.now(), {
      genesis: config.ledgerGenesis,
      marker: genesisMarker,
    });
    const anchored = new AnchoredBudgetStore(store, anchor);
    await anchored.start();
    // The continuity check has passed, so the verified spend is recorded now. A crash before the first settlement
    // then leaves no unanchored spend behind.
    for (const month of recentMonths(monthOf(Date.now()), 2)) {
      await anchored.refresh(month);
    }
    // The anchor now exists, so the genesis can be recorded. Recording it earlier would leave a stuck marker if the
    // anchor write failed.
    // Once the anchor exists the ledger has started. Recording is idempotent, so this also repairs a marker that a
    // previous start could not record.
    await genesisMarker.record();
    budget = anchored;
    const registered = new PostgresDeviceStore(pool);
    // A restore can bring back devices that were revoked after the backup. Refuse until they are revoked again.
    await checkRevocations(registered, anchor);
    await syncRevocations(registered, anchor);
    devices = registered;
    backups = new PostgresBackupStore(pool);
    const backupStore = backups;
    reaper = async () => {
      // Retention is enforced here too, so an expired backup is deleted even if no device asks for it.
      await backupStore.purgeExpired(Date.now());
      const settled = await store.reapStale(REAP_AFTER_SECONDS);
      // The reaper can settle reservations from the previous month, so refresh both months it may touch.
      for (const month of recentMonths(monthOf(Date.now()), 2)) {
        await anchored.refresh(month);
      }
      return settled;
    };
  } else {
    budget = new InMemoryBudgetStore();
    devices = new InMemoryDeviceStore();
    backups = new InMemoryBackupStore();
  }

  if (reaper !== undefined) {
    const runReaper = reaper;
    const timer = setInterval(() => {
      runReaper().catch(() => {
        process.stderr.write("reaper failed; will retry\n");
      });
    }, REAP_EVERY_MS);
    timer.unref();
  }

  const provider: ChatProvider =
    config.mode === "live" && config.openRouterApiKey !== undefined
      ? new OpenRouterProvider(config.openRouterApiKey, config.openRouterBaseUrl)
      : new MockProvider();

  const app = await buildServer({
    config,
    budget,
    devices,
    backups,
    provider,
    now: () => Date.now(),
    logger: {
      level: "info",
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[redacted]",
      },
    },
  });

  const shutdown = (): void => {
    void app
      .close()
      .then(() => pool?.end())
      .then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  // Print the error class only. Configuration and schema messages name variables or tables, never values.
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "startup failed";
  process.stderr.write(`broker failed to start: ${name}: ${message}\n`);
  process.exit(1);
});
