import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, loadConfig } from "./config.js";

const BASE_MOCK = {
  BROKER_MONTHLY_CAP_PAISE: "50000",
  BROKER_FX_PAISE_PER_USD: "10000",
};

/** A clearly fake provider key used only to check that secrets never reach error messages. */
const LIVE_SECRET = "sk-or-test-DO-NOT-USE-0000000000";

describe("secret files", () => {
  it("reads a secret from the file named by NAME_FILE", () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-secret-"));
    const file = join(dir, "key");
    writeFileSync(file, "sk-or-file-DO-NOT-USE-0000000000\n");
    const config = loadConfig({ ...BASE_MOCK, OPENROUTER_API_KEY_FILE: file });
    expect(config.openRouterApiKey).toBe("sk-or-file-DO-NOT-USE-0000000000");
  });

  it("refuses both NAME and NAME_FILE, so there is never doubt which value is used", () => {
    expect(() =>
      loadConfig({
        ...BASE_MOCK,
        OPENROUTER_API_KEY: "a",
        OPENROUTER_API_KEY_FILE: "/run/secrets/x",
      }),
    ).toThrow(/not both/);
  });

  it("reports an unreadable secret file by name, without its path or any value", () => {
    try {
      loadConfig({ ...BASE_MOCK, BROKER_DATABASE_URL_FILE: "/definitely/not/here/secret" });
      throw new Error("expected a ConfigError");
    } catch (error) {
      expect((error as Error).message).toBe("BROKER_DATABASE_URL_FILE could not be read");
    }
  });
});

describe("loadConfig", () => {
  it("defaults to mock mode with no provider key and no database", () => {
    const config = loadConfig({ ...BASE_MOCK });
    expect(config.mode).toBe("mock");
    expect(config.openRouterApiKey).toBeUndefined();
    expect(config.databaseUrl).toBeUndefined();
    expect(config.host).toBe("127.0.0.1");
    expect(config.providerMaxAttempts).toBe(2);
  });

  it("requires the monthly cap and the exchange rate, with no hidden default", () => {
    expect(() => loadConfig({ BROKER_FX_PAISE_PER_USD: "10000" })).toThrow(
      /BROKER_MONTHLY_CAP_PAISE is required/,
    );
    expect(() => loadConfig({ BROKER_MONTHLY_CAP_PAISE: "50000" })).toThrow(
      /BROKER_FX_PAISE_PER_USD is required/,
    );
  });

  it("refuses live mode without the provider key", () => {
    expect(() =>
      loadConfig({
        ...BASE_MOCK,
        BROKER_MODE: "live",
        BROKER_DATABASE_URL: "postgres://db",
        BROKER_LEDGER_ANCHOR_FILE: "/anchor/ledger-anchor.json",
        BROKER_OWNER_CAP_CONFIRMATION_PAISE: "50000",
      }),
    ).toThrow(/OPENROUTER_API_KEY is required in live mode/);
  });

  it("refuses a database without a spend-continuity anchor file", () => {
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_DATABASE_URL: "postgres://db" })).toThrow(
      /BROKER_LEDGER_ANCHOR_FILE is required/,
    );
    expect(
      loadConfig({
        ...BASE_MOCK,
        BROKER_DATABASE_URL: "postgres://db",
        BROKER_LEDGER_ANCHOR_FILE: "/anchor/ledger-anchor.json",
      }).ledgerAnchorPath,
    ).toBe("/anchor/ledger-anchor.json");
  });

  it("reads the trusted proxy hop count, defaulting to none", () => {
    expect(loadConfig(BASE_MOCK).trustProxyHops).toBe(0);
    expect(loadConfig({ ...BASE_MOCK, BROKER_TRUST_PROXY_HOPS: "1" }).trustProxyHops).toBe(1);
  });

  it("refuses live mode without a database", () => {
    expect(() =>
      loadConfig({
        ...BASE_MOCK,
        BROKER_MODE: "live",
        OPENROUTER_API_KEY: LIVE_SECRET,
        BROKER_OWNER_CAP_CONFIRMATION_PAISE: "50000",
      }),
    ).toThrow(/BROKER_DATABASE_URL is required in live mode/);
  });

  it("refuses live mode while paid calls are off, even with the cap confirmed", () => {
    const base = {
      ...BASE_MOCK,
      BROKER_MODE: "live",
      OPENROUTER_API_KEY: LIVE_SECRET,
      BROKER_DATABASE_URL: "postgres://db",
      BROKER_LEDGER_ANCHOR_FILE: "/anchor/ledger-anchor.json",
      BROKER_OWNER_CAP_CONFIRMATION_PAISE: "50000",
      BROKER_MONTHLY_CAP_PAISE: "50000",
    };
    expect(() => loadConfig(base)).toThrow(/BROKER_PAID_CALLS is off/);
    expect(() => loadConfig({ ...base, BROKER_PAID_CALLS: "off" })).toThrow(
      /BROKER_PAID_CALLS is off/,
    );
    expect(loadConfig({ ...base, BROKER_PAID_CALLS: "on" }).paidCalls).toBe(true);
  });

  it("rejects an unknown paid-calls value rather than guessing", () => {
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_PAID_CALLS: "yes" })).toThrow(/on or off/);
  });

  it("refuses a development-test cap above the owner's 50 rupee limit", () => {
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_DEV_TEST_CAP_PAISE: "5001" })).toThrow(
      /50 rupee/,
    );
    expect(loadConfig({ ...BASE_MOCK, BROKER_DEV_TEST_CAP_PAISE: "5000" }).devTestCapPaise).toBe(
      5000,
    );
  });

  it("refuses live mode until the owner confirms the cap", () => {
    const base = {
      ...BASE_MOCK,
      BROKER_MODE: "live",
      OPENROUTER_API_KEY: LIVE_SECRET,
      BROKER_DATABASE_URL: "postgres://db",
      BROKER_LEDGER_ANCHOR_FILE: "/anchor/ledger-anchor.json",
      BROKER_PAID_CALLS: "on",
    };
    expect(() => loadConfig(base)).toThrow(/owner confirmation of the cap/);
    expect(() => loadConfig({ ...base, BROKER_OWNER_CAP_CONFIRMATION_PAISE: "40000" })).toThrow(
      /owner confirmation of the cap/,
    );
    expect(loadConfig({ ...base, BROKER_OWNER_CAP_CONFIRMATION_PAISE: "50000" }).mode).toBe("live");
  });

  it("never puts a secret value into an error message", () => {
    try {
      loadConfig({
        ...BASE_MOCK,
        BROKER_MODE: "live",
        OPENROUTER_API_KEY: LIVE_SECRET,
        BROKER_DATABASE_URL: "postgres://db",
        BROKER_LEDGER_ANCHOR_FILE: "/anchor/ledger-anchor.json",
        BROKER_OWNER_CAP_CONFIRMATION_PAISE: "1",
        BROKER_PROVIDER_TIMEOUT_MS: LIVE_SECRET,
      });
      throw new Error("expected a ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).not.toContain(LIVE_SECRET);
    }
  });

  it("rejects a provider base URL that is not https, except localhost for tests", () => {
    expect(() =>
      loadConfig({ ...BASE_MOCK, BROKER_OPENROUTER_BASE_URL: "http://example.com/api" }),
    ).toThrow(/must use https/);
    expect(
      loadConfig({ ...BASE_MOCK, BROKER_OPENROUTER_BASE_URL: "http://localhost:9999/api" })
        .openRouterBaseUrl,
    ).toBe("http://localhost:9999/api");
  });

  it("rejects an unknown mode and a non-numeric limit", () => {
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_MODE: "prod" })).toThrow(/mock or live/);
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_PROVIDER_TIMEOUT_MS: "20s" })).toThrow(
      /whole number/,
    );
  });

  it("restricts provider attempts to 1 or 2", () => {
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_PROVIDER_MAX_ATTEMPTS: "3" })).toThrow(/1 or 2/);
    expect(
      loadConfig({ ...BASE_MOCK, BROKER_PROVIDER_MAX_ATTEMPTS: "1" }).providerMaxAttempts,
    ).toBe(1);
  });
});

describe("first-start flag for the spend anchor", () => {
  it("accepts only the exact value yes, and defaults to off", () => {
    expect(loadConfig(BASE_MOCK).ledgerGenesis).toBe(false);
    expect(loadConfig({ ...BASE_MOCK, BROKER_LEDGER_GENESIS: "yes" }).ledgerGenesis).toBe(true);
    expect(() => loadConfig({ ...BASE_MOCK, BROKER_LEDGER_GENESIS: "true" })).toThrow(
      /must be exactly yes/,
    );
  });
});

describe("BROKER_CORS_ORIGINS", () => {
  it("defaults to no origins and parses a comma-separated list", () => {
    expect(loadConfig(BASE_MOCK).corsOrigins).toEqual([]);
    expect(
      loadConfig({
        ...BASE_MOCK,
        BROKER_CORS_ORIGINS: " http://localhost:8081 , http://127.0.0.1:8081 ",
      }).corsOrigins,
    ).toEqual(["http://localhost:8081", "http://127.0.0.1:8081"]);
  });

  it("refuses wildcards, paths and non-web schemes", () => {
    for (const bad of ["*", "http://localhost:8081/app", "ftp://example.com", "localhost:8081"]) {
      expect(() => loadConfig({ ...BASE_MOCK, BROKER_CORS_ORIGINS: bad })).toThrow(
        /BROKER_CORS_ORIGINS/,
      );
    }
  });
});
