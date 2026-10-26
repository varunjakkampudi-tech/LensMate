import { readFileSync } from "node:fs";

/**
 * Broker configuration from the server environment only.
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
  /** Set to "yes" once, by the owner, for the first start of an empty ledger. Otherwise a missing anchor refuses to start. */
  readonly ledgerGenesis: boolean;
  /** Number of reverse-proxy hops in front of the broker, so per-client limits see the real client address. */
  readonly trustProxyHops: number;
  /** Browser origins allowed to call the broker (the web preview only). Empty means no cross-origin access. */
  readonly corsOrigins: readonly string[];
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
  /** Owner switch for paid provider calls. Off by default; live mode is refused until it is "on". */
  readonly paidCalls: boolean;
  /**
   * Cumulative development-test cap in paise, kept apart from the monthly cap. When set, paid attempts are charged to
   * this bucket instead of the monthly one. Undefined means the monthly cap applies.
   */
  readonly devTestCapPaise: number | undefined;
}

/** Highest development-test cap the owner has approved: ₹50, in paise. Enforced in code, not only in configuration. */
const DEV_TEST_MAX_PAISE = 5_000;

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

/**
 * Hard ceiling on the monthly provider spend, in paise (INR 500). It is fixed in code, so a configuration value can never
 * raise the cap above what the owner approved. Raising it means a reviewed code change, not an environment edit.
 */
const MAX_MONTHLY_CAP_PAISE = 50_000;

export function loadConfig(env: Readonly<Record<string, string | undefined>>): BrokerConfig {
  const mode = parseMode(env.BROKER_MODE);
  const monthlyCapPaise = requiredInt(env, "BROKER_MONTHLY_CAP_PAISE", 0);
  if (monthlyCapPaise > MAX_MONTHLY_CAP_PAISE) {
    throw new ConfigError(
      "BROKER_MONTHLY_CAP_PAISE is above the hard ceiling of INR 500 (50000 paise)",
    );
  }
  const paisePerUsd = requiredInt(env, "BROKER_FX_PAISE_PER_USD", 1);
  const ownerCapConfirmation = optionalInt(env, "BROKER_OWNER_CAP_CONFIRMATION_PAISE");
  const paidCalls = parsePaidCalls(env.BROKER_PAID_CALLS);
  const devTestCapPaise = optionalInt(env, "BROKER_DEV_TEST_CAP_PAISE");
  if (devTestCapPaise !== undefined && devTestCapPaise > DEV_TEST_MAX_PAISE) {
    throw new ConfigError(
      "BROKER_DEV_TEST_CAP_PAISE is above the owner's 50 rupee development-test limit",
    );
  }
  const openRouterApiKey = readSecret(env, "OPENROUTER_API_KEY");
  const databaseUrl = readSecret(env, "BROKER_DATABASE_URL");
  const ledgerAnchorPath = env.BROKER_LEDGER_ANCHOR_FILE?.trim() || undefined;
  const trustProxyHops = optionalInt(env, "BROKER_TRUST_PROXY_HOPS") ?? 0;
  const corsOrigins = parseOrigins(env.BROKER_CORS_ORIGINS);
  const genesisRaw = emptyToUndefined(env.BROKER_LEDGER_GENESIS);
  if (genesisRaw !== undefined && genesisRaw !== "yes") {
    throw new ConfigError("BROKER_LEDGER_GENESIS must be exactly yes when set");
  }
  const ledgerGenesis = genesisRaw === "yes";
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
    if (!paidCalls) {
      throw new ConfigError(
        "live mode is refused while BROKER_PAID_CALLS is off (paid calls need the owner's explicit authorisation)",
      );
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
    ledgerGenesis,
    trustProxyHops,
    corsOrigins,
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
    paidCalls,
    devTestCapPaise,
  };
}

function parsePaidCalls(value: string | undefined): boolean {
  const raw = emptyToUndefined(value);
  if (raw === undefined || raw === "off") {
    return false;
  }
  if (raw === "on") {
    return true;
  }
  throw new ConfigError("BROKER_PAID_CALLS must be on or off");
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
/**
 * Comma-separated browser origins, each exactly "scheme://host[:port]". Wildcards and paths are refused, so a
 * mis-typed value cannot open the broker to every site.
 */
function parseOrigins(raw: string | undefined): readonly string[] {
  const items = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  for (const item of items) {
    let url: URL;
    try {
      url = new URL(item);
    } catch {
      throw new ConfigError("BROKER_CORS_ORIGINS must list origins such as http://localhost:8081");
    }
    const isOrigin =
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin === item.replace(/\/$/, "");
    if (!isOrigin) {
      throw new ConfigError("BROKER_CORS_ORIGINS must list origins such as http://localhost:8081");
    }
  }
  return items;
}

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
