import { readFileSync } from "node:fs";

/**
 * Broker configuration from the server environment only (Engineering Standards 4; Amendment C.2).
 *
 * Secrets are read from environment variables and never logged. The error messages name the variable,
 * never its value. Billable mode is refused unless the owner has confirmed the cap in configuration.
 */
type BrokerMode = "mock" | "live";

export interface BrokerConfig {
  readonly mode: BrokerMode;
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string | undefined;
  /** Anchor file on a volume the database restore never touches. Required when a database is configured. */
  readonly ledgerAnchorPath: string | undefined;
  /** Number of reverse-proxy hops in front of the broker, so per-client limits see the real client address. */
  readonly trustProxyHops: number;
  readonly openRouterApiKey: string | undefined;
  readonly openRouterBaseUrl: string;
  /** Monthly cap in paise (integer). Owner-confirmed before any live call. */
  readonly monthlyCapPaise: number;
  /** Exchange-rate setting used to convert USD prices to paise. Required; no default. */
  readonly paisePerUsd: number;
  readonly dailyRequestQuotaPerClient: number;
  readonly rateLimitBurst: number;
  readonly rateLimitRefillPerSecond: number;
  readonly maxConcurrentPerClient: number;
  readonly maxConcurrentTotal: number;
  readonly providerTimeoutMs: number;
  readonly providerMaxAttempts: 1 | 2;
  readonly maxInputBytes: number;
  readonly maxOutputTokensCeiling: number;
  readonly maxImageBytes: number;
  /** Owner-measured worst-case image token count for the vision model. Vision is off until it is set. */
  readonly imageTokenCeiling: number | undefined;
  readonly ownerCapConfirmation: number | undefined;
}

const DEFAULTS = {
  port: 8080,
  host: "127.0.0.1",
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  dailyRequestQuotaPerClient: 200,
  rateLimitBurst: 10,
  rateLimitRefillPerSecond: 1,
  maxConcurrentPerClient: 2,
  maxConcurrentTotal: 8,
  providerTimeoutMs: 20_000,
  providerMaxAttempts: 2,
  maxInputBytes: 16_384,
  maxOutputTokensCeiling: 512,
  maxImageBytes: 1_048_576,
} as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): BrokerConfig {
  const mode = parseMode(env.BROKER_MODE);
  const monthlyCapPaise = requiredInt(env, "BROKER_MONTHLY_CAP_PAISE", 0);
  const paisePerUsd = requiredInt(env, "BROKER_FX_PAISE_PER_USD", 1);
  const ownerCapConfirmation = optionalInt(env, "BROKER_OWNER_CAP_CONFIRMATION_PAISE");
  const openRouterApiKey = readSecret(env, "OPENROUTER_API_KEY");
  const databaseUrl = readSecret(env, "BROKER_DATABASE_URL");
  const ledgerAnchorPath = env.BROKER_LEDGER_ANCHOR_FILE?.trim() || undefined;
  const trustProxyHops = optionalInt(env, "BROKER_TRUST_PROXY_HOPS") ?? 0;
  if (databaseUrl !== undefined && ledgerAnchorPath === undefined) {
    throw new ConfigError(
      "BROKER_LEDGER_ANCHOR_FILE is required when a database is configured (spend continuity, see ledger-anchor.ts)",
    );
  }

  if (mode === "live") {
    if (openRouterApiKey === undefined) {
      throw new ConfigError("OPENROUTER_API_KEY is required in live mode");
    }
    if (databaseUrl === undefined) {
      throw new ConfigError("BROKER_DATABASE_URL is required in live mode");
    }
    if (ownerCapConfirmation !== monthlyCapPaise) {
      throw new ConfigError(
        "live mode is refused until BROKER_OWNER_CAP_CONFIRMATION_PAISE equals BROKER_MONTHLY_CAP_PAISE (owner confirmation of the cap)",
      );
    }
  }

  const baseUrl = env.BROKER_OPENROUTER_BASE_URL ?? DEFAULTS.openRouterBaseUrl;
  if (!baseUrl.startsWith("https://") && !isLocalhost(baseUrl)) {
    throw new ConfigError("BROKER_OPENROUTER_BASE_URL must use https");
  }

  return {
    mode,
    port: optionalInt(env, "BROKER_PORT") ?? DEFAULTS.port,
    host: env.BROKER_HOST ?? DEFAULTS.host,
    databaseUrl,
    ledgerAnchorPath,
    trustProxyHops,
    openRouterApiKey,
    openRouterBaseUrl: baseUrl,
    monthlyCapPaise,
    paisePerUsd,
    dailyRequestQuotaPerClient:
      optionalInt(env, "BROKER_DAILY_REQUEST_QUOTA") ?? DEFAULTS.dailyRequestQuotaPerClient,
    rateLimitBurst: optionalInt(env, "BROKER_RATE_LIMIT_BURST") ?? DEFAULTS.rateLimitBurst,
    rateLimitRefillPerSecond:
      optionalInt(env, "BROKER_RATE_LIMIT_REFILL_PER_SECOND") ?? DEFAULTS.rateLimitRefillPerSecond,
    maxConcurrentPerClient:
      optionalInt(env, "BROKER_MAX_CONCURRENT_PER_CLIENT") ?? DEFAULTS.maxConcurrentPerClient,
    maxConcurrentTotal:
      optionalInt(env, "BROKER_MAX_CONCURRENT_TOTAL") ?? DEFAULTS.maxConcurrentTotal,
    providerTimeoutMs: optionalInt(env, "BROKER_PROVIDER_TIMEOUT_MS") ?? DEFAULTS.providerTimeoutMs,
    providerMaxAttempts: parseAttempts(optionalInt(env, "BROKER_PROVIDER_MAX_ATTEMPTS")),
    maxInputBytes: optionalInt(env, "BROKER_MAX_INPUT_BYTES") ?? DEFAULTS.maxInputBytes,
    maxOutputTokensCeiling:
      optionalInt(env, "BROKER_MAX_OUTPUT_TOKENS_CEILING") ?? DEFAULTS.maxOutputTokensCeiling,
    maxImageBytes: optionalInt(env, "BROKER_MAX_IMAGE_BYTES") ?? DEFAULTS.maxImageBytes,
    imageTokenCeiling: optionalInt(env, "BROKER_VISION_IMAGE_TOKEN_CEILING"),
    ownerCapConfirmation,
  };
}

function parseMode(value: string | undefined): BrokerMode {
  if (value === undefined || value === "mock") {
    return "mock";
  }
  if (value === "live") {
    return "live";
  }
  throw new ConfigError("BROKER_MODE must be mock or live");
}

function parseAttempts(value: number | undefined): 1 | 2 {
  const attempts = value ?? DEFAULTS.providerMaxAttempts;
  if (attempts !== 1 && attempts !== 2) {
    throw new ConfigError("BROKER_PROVIDER_MAX_ATTEMPTS must be 1 or 2");
  }
  return attempts;
}

function requiredInt(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  min: number,
): number {
  const value = optionalInt(env, name);
  if (value === undefined) {
    throw new ConfigError(`${name} is required`);
  }
  if (value < min) {
    throw new ConfigError(`${name} must be at least ${String(min)}`);
  }
  return value;
}

function optionalInt(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): number | undefined {
  const raw = emptyToUndefined(env[name]);
  if (raw === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a whole number`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new ConfigError(`${name} is too large`);
  }
  return value;
}

/**
 * A secret from NAME, or from the file named by NAME_FILE (the Docker secrets convention). Both at once is an error,
 * so there is never doubt about which value is in use. The value is never echoed in an error message.
 */
function readSecret(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = emptyToUndefined(env[name]);
  const path = emptyToUndefined(env[`${name}_FILE`]);
  if (direct !== undefined && path !== undefined) {
    throw new ConfigError(`set ${name} or ${name}_FILE, not both`);
  }
  if (path === undefined) {
    return direct;
  }
  try {
    return emptyToUndefined(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError(`${name}_FILE could not be read`);
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function isLocalhost(url: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}
