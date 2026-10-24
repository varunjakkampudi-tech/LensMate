import type { BrokerConfig } from "./config.js";

/** Test-only configuration. Excluded from the build. The FX rate is a test value, not an owner setting. */
export const TEST_DEVICE_ID = "11111111-2222-4333-8444-555555555555";
// A clearly fake, low-entropy placeholder. It is long enough for the 32-character minimum and is not a credential.
export const TEST_CLIENT_SECRET = "not-a-real-secret-".repeat(3);
export const TEST_AUTH_HEADER = `Bearer ${TEST_DEVICE_ID}.${TEST_CLIENT_SECRET}`;

export function testConfig(overrides: Partial<BrokerConfig> = {}): BrokerConfig {
  return {
    mode: "mock",
    port: 0,
    host: "127.0.0.1",
    databaseUrl: undefined,
    ledgerAnchorPath: undefined,
    ledgerGenesis: false,
    trustProxyHops: 0,
    corsOrigins: [],
    openRouterApiKey: undefined,
    openRouterBaseUrl: "https://openrouter.ai/api/v1",
    monthlyCapPaise: 50_000,
    paisePerUsd: 9_000,
    dailyRequestQuotaPerClient: 1_000,
    rateLimitBurst: 1_000,
    rateLimitRefillPerSecond: 1_000,
    maxConcurrentPerClient: 50,
    maxConcurrentTotal: 500,
    providerTimeoutMs: 2_000,
    providerMaxAttempts: 2,
    maxInputBytes: 16_384,
    maxOutputTokensCeiling: 512,
    maxImageBytes: 1_048_576,
    imageTokenCeiling: undefined,
    ownerCapConfirmation: undefined,
    ...overrides,
  };
}
