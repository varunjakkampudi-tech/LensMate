import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { InMemoryBudgetStore, type BudgetStore } from "./budget.js";
import { PostgresBudgetStore } from "./postgres-budget.js";
import { OpenRouterProvider, MockProvider, type ChatProvider } from "./provider.js";
import { buildServer } from "./server.js";

/** Open reservations older than this are charged at worst case by the reaper. It is well past any provider timeout. */
const REAP_AFTER_SECONDS = 300;
const REAP_EVERY_MS = 60_000;

/**
 * Broker entry point. Reads configuration from the server environment only. Mock mode (the default) makes no
 * provider call and needs no database. Live mode needs OPENROUTER_API_KEY, a database, and the owner's cap
 * confirmation; loadConfig refuses it otherwise.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);

  let budget: BudgetStore;
  let pool: Pool | undefined;
  let reaper: (() => Promise<number>) | undefined;
  if (config.databaseUrl !== undefined) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 30_000 });
    // An idle connection error must not crash the process. The pool discards the connection and reconnects.
    pool.on("error", () => {
      process.stderr.write("ledger connection lost; reconnecting\n");
    });
    const store = new PostgresBudgetStore(pool);
    await store.migrate();
    budget = store;
    reaper = () => store.reapStale(REAP_AFTER_SECONDS);
  } else {
    budget = new InMemoryBudgetStore();
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
  // Print the error class only. Configuration messages name variables, never their values.
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "startup failed";
  process.stderr.write(`broker failed to start: ${name}: ${message}\n`);
  process.exit(1);
});
