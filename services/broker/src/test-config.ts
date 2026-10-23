import { hashClientSecret, type BrokerConfig } from "./config.js";

/** Test-only configuration. Excluded from the build. The FX rate is a test value, not an owner setting. */
const TEST_CLIENT_ID = "test-client";
export const TEST_CLIENT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
export const TEST_AUTH_HEADER = `Bearer ${TEST_CLIENT_ID}.${TEST_CLIENT_SECRET}`;

export function testConfig(overrides: Partial<BrokerConfig> = {}): BrokerConfig {
  return {
    mode: "mock",
    port: 0,
    host: "127.0.0.1",
    databaseUrl: undefined,
    openRouterApiKey: undefined,
    openRouterBaseUrl: "https://openrouter.ai/api/v1",
    clients: [{ id: TEST_CLIENT_ID, secretSha256: hashClientSecret(TEST_CLIENT_SECRET) }],
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
