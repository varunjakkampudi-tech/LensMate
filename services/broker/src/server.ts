import { randomUUID } from "node:crypto";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerDefault,
} from "fastify";
import type { BrokerConfig } from "./config.js";
import type { BudgetStore, ReserveRefusal, ReserveResult } from "./budget.js";
import { ConcurrencyGuard, TokenBucket } from "./limits.js";
import { authenticateDevice, redeemEnrolment, type DeviceStore } from "./devices.js";
import {
  InMemoryBackupStore,
  MAX_BACKUP_CHARS,
  MAX_RETENTION_DAYS,
  retentionExpiry,
  type BackupStore,
} from "./backup.js";
import {
  actualMicroUsd,
  findModel,
  microUsdToPaise,
  worstCaseMicroUsd,
  type ModelPrice,
} from "./pricing.js";
import {
  ProviderFailure,
  ProviderTimeoutError,
  type ChatMessage,
  type ChatProvider,
  type ProviderReply,
} from "./provider.js";

/** Tokens allowed for the provider's own chat template around the messages (upper bound, Amendment C.5). */
const TEMPLATE_ALLOWANCE_TOKENS = 256;
/** Tokens allowed per message for role and separators (upper bound). */
const PER_MESSAGE_OVERHEAD_TOKENS = 8;
const MAX_MESSAGES = 20;
const MAX_CONTENT_CHARS = 16_384;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * The rate-limit key for an address. An IPv6 client controls a whole /64, so the key keeps only the first four groups.
 * IPv4 addresses are used as they are.
 */
export function enrolmentKey(address: string): string {
  // An IPv4-mapped IPv6 address ("::ffff:a.b.c.d") is the IPv4 client. Keying it as IPv6 would merge every such client.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1] !== undefined) {
    return mapped[1];
  }
  if (!address.includes(":")) {
    return address;
  }
  const [head = "", tail = ""] = address.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === "" ? [] : tail.split(":");
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const groups = [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups];
  return groups.slice(0, 4).join(":");
}

export interface BrokerDependencies {
  readonly config: BrokerConfig;
  readonly budget: BudgetStore;
  /** Registered devices and enrolment codes. */
  readonly devices: DeviceStore;
  readonly provider: ChatProvider;
  /** Encrypted memory backups. Defaults to an in-memory store (tests and mock mode). */
  readonly backups?: BackupStore;
  /** Source of time, in milliseconds since the epoch. Injected so tests control day and month boundaries. */
  readonly now: () => number;
  /**
   * Identifies the caller for the enrolment rate limit. Defaults to the client address (see `trustProxyHops`). Tests
   * pass a header so each simulated client has its own bucket.
   */
  readonly enrolmentSource?: (request: { headers: Record<string, unknown>; ip: string }) => string;
  /** Pino options. Tests pass a stream to capture output; production uses stdout. */
  readonly logger: {
    level: string;
    redact: { paths: string[]; censor: string };
    stream?: NodeJS.WritableStream;
  };
}

const CHAT_BODY = {
  type: "object",
  additionalProperties: false,
  required: ["model", "messages", "maxOutputTokens"],
  properties: {
    model: { type: "string", minLength: 1, maxLength: 128 },
    messages: {
      type: "array",
      minItems: 1,
      maxItems: MAX_MESSAGES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "content"],
        properties: {
          role: { type: "string", enum: ["system", "user", "assistant"] },
          content: { type: "string", maxLength: MAX_CONTENT_CHARS },
        },
      },
    },
    maxOutputTokens: { type: "integer", minimum: 1, maximum: 100_000 },
  },
} as const;

const VISION_BODY = {
  type: "object",
  additionalProperties: false,
  required: ["model", "prompt", "imageDataUrl", "maxOutputTokens"],
  properties: {
    model: { type: "string", minLength: 1, maxLength: 128 },
    prompt: { type: "string", minLength: 1, maxLength: 4_000 },
    imageDataUrl: { type: "string", minLength: 1, maxLength: 2_000_000 },
    maxOutputTokens: { type: "integer", minimum: 1, maximum: 100_000 },
  },
} as const;

interface ChatBody {
  readonly model: string;
  readonly messages: readonly { role: ChatMessage["role"]; content: string }[];
  readonly maxOutputTokens: number;
}

interface VisionBody {
  readonly model: string;
  readonly prompt: string;
  readonly imageDataUrl: string;
  readonly maxOutputTokens: number;
}

/**
 * Builds the broker HTTP service. Every provider call passes these checks, in order: authentication, rate limit,
 * input validation, model allowlist, output ceiling, worst-case reservation under the cap and daily quota,
 * concurrency guard, a timed provider attempt, then settlement or release. Request content is never logged.
 */
export async function buildServer(deps: BrokerDependencies): Promise<FastifyInstance> {
  const { config, budget, provider, now, devices } = deps;
  // Per client address, so one caller cannot lock out the others. There is no shared ceiling: a shared ceiling would let
  // one caller refuse enrolment for everyone. Guessing is not practical anyway, because codes carry about 78 random bits.
  const enrolPerSource = new TokenBucket(5, 1 / 60, now);
  const app = Fastify<RawServerDefault>({
    logger: deps.logger as NonNullable<FastifyServerOptions["logger"]>,
    // Only a configured number of proxy hops may set the client address. Otherwise a caller could forge it.
    trustProxy: config.trustProxyHops > 0 ? (_address, hop) => hop < config.trustProxyHops : false,
    bodyLimit: Math.max(config.maxInputBytes, config.maxImageBytes * 2) + 65_536,
    // Unknown fields are rejected, not silently dropped, and types are never coerced ("64" is not 64).
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  });
  const rate = new TokenBucket(config.rateLimitBurst, config.rateLimitRefillPerSecond, now);
  const concurrency = new ConcurrencyGuard(
    config.maxConcurrentPerClient,
    config.maxConcurrentTotal,
  );

  // Browser access for the web preview only. Origins come from configuration; with none set, no cross-origin call
  // is allowed. Native phone builds do not use CORS and are unaffected.
  const allowedOrigins = new Set(config.corsOrigins);
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined || !allowedOrigins.has(origin)) {
      return;
    }
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Max-Age", "600");
    reply.header("Vary", "Origin");
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ errorName: error.name }, "unhandled broker error");
      return reply.code(500).send({ error: "internal", code: "INTERNAL" });
    }
    return reply.code(400).send({ error: "invalid_request", code: "VALIDATION" });
  });

  app.get("/healthz", async (_request, reply) => {
    try {
      await budget.ping();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  app.post<{ Body: { code: string; label: string } }>(
    "/v1/enrol",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["code", "label"],
          properties: {
            code: { type: "string", minLength: 8, maxLength: 40 },
            // Same pattern as the table CHECK. Checked here so a bad label is refused before the code is redeemed.
            label: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9 ._-]{1,64}$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Per-client first, so a refused client does not spend the shared ceiling.
      const source = enrolmentKey(deps.enrolmentSource?.(request) ?? request.ip);
      if (!enrolPerSource.take(source)) {
        return reply.code(429).send({ error: "try_later", code: "RATE_LIMITED" });
      }
      const result = await redeemEnrolment(devices, request.body.code, request.body.label, now());
      request.log.info({ outcome: result === null ? "refused" : "enrolled" }, "enrolment");
      if (result === null) {
        // The same answer for an unknown, used or expired code, so a caller learns nothing about codes.
        return reply.code(403).send({ error: "enrolment_refused", code: "ENROLMENT_REFUSED" });
      }
      return reply.code(200).header("cache-control", "no-store").send({
        deviceId: result.deviceId,
        deviceSecret: result.deviceSecret,
      });
    },
  );

  const backups = deps.backups ?? new InMemoryBackupStore();
  const BACKUP_BODY = {
    type: "object",
    additionalProperties: false,
    required: ["ciphertext", "retentionDays"],
    properties: {
      ciphertext: {
        type: "string",
        minLength: 1,
        maxLength: MAX_BACKUP_CHARS,
        pattern: "^[A-Za-z0-9+/=.:_-]+$",
      },
      retentionDays: { type: "integer", minimum: 1, maximum: MAX_RETENTION_DAYS },
    },
  } as const;

  // Backup routes: device-authenticated and rate-limited; the broker stores only opaque ciphertext.
  app.put<{ Body: { ciphertext: string; retentionDays: number } }>(
    "/v1/backup",
    { schema: { body: BACKUP_BODY } },
    async (request, reply) => {
      const client = await authenticateDevice(request.headers.authorization, devices);
      if (client === null) {
        return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
      }
      if (!rate.take(client)) {
        return reply.code(429).send({ error: "rate_limited", code: "RATE_LIMITED" });
      }
      const at = now();
      const expiresAt = retentionExpiry(at, request.body.retentionDays);
      await backups.put(client, request.body.ciphertext, at, expiresAt);
      return { updatedAt: at, expiresAt };
    },
  );

  app.get("/v1/backup", async (request, reply) => {
    const client = await authenticateDevice(request.headers.authorization, devices);
    if (client === null) {
      return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!rate.take(client)) {
      return reply.code(429).send({ error: "rate_limited", code: "RATE_LIMITED" });
    }
    const stored = await backups.get(client, now());
    // Ciphertext of the user's memory must never be cached by a proxy or the browser.
    reply.header("cache-control", "no-store");
    if (stored === null) {
      return reply.code(404).send({ error: "not_found", code: "NO_BACKUP" });
    }
    return stored;
  });

  app.delete("/v1/backup", async (request, reply) => {
    const client = await authenticateDevice(request.headers.authorization, devices);
    if (client === null) {
      return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!rate.take(client)) {
      return reply.code(429).send({ error: "rate_limited", code: "RATE_LIMITED" });
    }
    await backups.remove(client);
    return reply.code(204).send();
  });

  app.get("/v1/usage", async (request, reply) => {
    const client = await authenticateDevice(request.headers.authorization, devices);
    if (client === null) {
      return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    const month = utcMonth(now());
    const summary = await budget.summary(month);
    return {
      month,
      capPaise: config.monthlyCapPaise,
      spentPaise: summary.spentPaise,
      reservedPaise: summary.reservedPaise,
      remainingPaise: Math.max(
        0,
        config.monthlyCapPaise - summary.spentPaise - summary.reservedPaise,
      ),
      source: config.mode === "live" ? "openrouter" : "mock",
    };
  });

  app.post<{ Body: ChatBody }>(
    "/v1/ai/text",
    { schema: { body: CHAT_BODY } },
    async (request, reply) => {
      const client = await authenticateDevice(request.headers.authorization, devices);
      if (client === null) {
        return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
      }
      if (!rate.take(client)) {
        return reply.code(429).send({ error: "try_later", code: "RATE_LIMITED" });
      }
      const model = findModel(request.body.model);
      if (model === undefined || (model.feature !== "text" && model.feature !== "research")) {
        return reply.code(400).send({ error: "invalid_request", code: "MODEL_NOT_ALLOWED" });
      }
      if (request.body.maxOutputTokens > config.maxOutputTokensCeiling) {
        return reply.code(400).send({ error: "invalid_request", code: "OUTPUT_LIMIT" });
      }
      const inputBytes = request.body.messages.reduce(
        (sum, message) => sum + Buffer.byteLength(message.content, "utf8"),
        0,
      );
      if (inputBytes > config.maxInputBytes) {
        return reply.code(400).send({ error: "invalid_request", code: "INPUT_TOO_LARGE" });
      }
      const inputBoundTokens =
        inputBytes +
        request.body.messages.length * PER_MESSAGE_OVERHEAD_TOKENS +
        TEMPLATE_ALLOWANCE_TOKENS;
      return runProviderCall(request.log, reply, {
        client,
        model,
        messages: request.body.messages,
        maxOutputTokens: request.body.maxOutputTokens,
        inputBoundTokens,
      });
    },
  );

  app.post<{ Body: VisionBody }>(
    "/v1/ai/vision",
    { schema: { body: VISION_BODY } },
    async (request, reply) => {
      const client = await authenticateDevice(request.headers.authorization, devices);
      if (client === null) {
        return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
      }
      if (!rate.take(client)) {
        return reply.code(429).send({ error: "try_later", code: "RATE_LIMITED" });
      }
      const model = findModel(request.body.model);
      if (model === undefined || model.feature !== "vision" || !model.acceptsImages) {
        return reply.code(400).send({ error: "invalid_request", code: "MODEL_NOT_ALLOWED" });
      }
      if (config.imageTokenCeiling === undefined) {
        return reply.code(503).send({ error: "try_later", code: "FEATURE_UNAVAILABLE" });
      }
      if (request.body.maxOutputTokens > config.maxOutputTokensCeiling) {
        return reply.code(400).send({ error: "invalid_request", code: "OUTPUT_LIMIT" });
      }
      const image = IMAGE_DATA_URL.exec(request.body.imageDataUrl);
      const imageBytes = image === null ? -1 : base64DecodedBytes(image[2] ?? "");
      if (image === null || imageBytes > config.maxImageBytes) {
        return reply.code(400).send({ error: "invalid_request", code: "IMAGE_REJECTED" });
      }
      const promptBytes = Buffer.byteLength(request.body.prompt, "utf8");
      if (promptBytes > config.maxInputBytes) {
        return reply.code(400).send({ error: "invalid_request", code: "INPUT_TOO_LARGE" });
      }
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: request.body.prompt },
            { type: "image_url", image_url: { url: request.body.imageDataUrl } },
          ],
        },
      ];
      const inputBoundTokens =
        promptBytes +
        PER_MESSAGE_OVERHEAD_TOKENS +
        TEMPLATE_ALLOWANCE_TOKENS +
        config.imageTokenCeiling;
      return runProviderCall(request.log, reply, {
        client,
        model,
        messages,
        maxOutputTokens: request.body.maxOutputTokens,
        inputBoundTokens,
      });
    },
  );

  type CallPlan = {
    readonly client: string;
    readonly model: ModelPrice;
    readonly messages: readonly ChatMessage[];
    readonly maxOutputTokens: number;
    readonly inputBoundTokens: number;
  };

  type Logger = {
    info: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
  };
  type Replier = { code: (status: number) => { send: (body: object) => unknown } };

  /**
   * One user request. Every provider attempt reserves its worst case first. If the provider was called and then
   * failed, the whole reservation is charged, not released: a timed-out or failed call may still have been billed
   * by the provider, and releasing it would understate spend. This is conservative by design (Finding 1 of the
   * independent review). A reservation is released only when it was never used.
   */
  async function runProviderCall(log: Logger, reply: Replier, plan: CallPlan): Promise<unknown> {
    const requestId = randomUUID();
    const release = concurrency.acquire(plan.client);
    if (release === null) {
      return reply.code(429).send({ error: "try_later", code: "BUSY" });
    }
    const started = now();
    try {
      const worstPaise = microUsdToPaise(
        worstCaseMicroUsd(plan.model, plan.inputBoundTokens, plan.maxOutputTokens),
        config.paisePerUsd,
      );
      let lastFailure: "PROVIDER_UNAVAILABLE" | "TIMEOUT" = "PROVIDER_UNAVAILABLE";
      for (let attempt = 1; attempt <= config.providerMaxAttempts; attempt += 1) {
        const reservationId = `${requestId}-${String(attempt)}`;
        let reserved: ReserveResult;
        try {
          // Every paid attempt is charged to the monthly cap. With a development-test cap, it is also charged to the
          // cumulative bucket, and is refused if either cap has no room.
          reserved = await budget.reserve({
            reservationId,
            clientId: plan.client,
            month: utcMonth(now()),
            day: utcDay(now()),
            amountPaise: worstPaise,
            capPaise: config.monthlyCapPaise,
            devTestCapPaise: config.devTestCapPaise,
            dailyRequestQuota: config.dailyRequestQuotaPerClient,
          });
        } catch {
          log.error({ requestId, client: plan.client }, "ledger unavailable at reserve");
          return reply.code(503).send({ error: "try_later", code: "LEDGER_UNAVAILABLE" });
        }
        if (!reserved.ok) {
          return refusal(reply, reserved.reason);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, config.providerTimeoutMs);
        let answer: ProviderReply;
        try {
          answer = await provider.complete({
            model: plan.model.id,
            messages: plan.messages,
            maxOutputTokens: plan.maxOutputTokens,
            signal: controller.signal,
          });
        } catch (error) {
          clearTimeout(timer);
          const timedOut = error instanceof ProviderTimeoutError || controller.signal.aborted;
          lastFailure = timedOut ? "TIMEOUT" : "PROVIDER_UNAVAILABLE";
          // The provider may have billed this attempt, so the worst case stays charged.
          const charged = await settleAtWorstCase(reservationId, worstPaise);
          if (!charged) {
            log.error(
              { requestId, client: plan.client },
              "ledger unavailable after failed attempt; attempt held open",
            );
            return reply.code(503).send({ error: "try_later", code: "LEDGER_UNAVAILABLE" });
          }
          const retryable = !timedOut && error instanceof ProviderFailure && error.retryable;
          if (!retryable) {
            break;
          }
          continue;
        }
        clearTimeout(timer);
        return await settleAndRespond(
          log,
          reply,
          plan,
          reservationId,
          answer,
          requestId,
          started,
          attempt,
          worstPaise,
        );
      }
      log.info(
        { requestId, client: plan.client, model: plan.model.id, outcome: lastFailure },
        "provider call failed",
      );
      return reply.code(503).send({ error: "try_later", code: lastFailure });
    } finally {
      release();
    }
  }

  /** Charges a reservation at its worst case. Returns false when the ledger could not record it. */
  async function settleAtWorstCase(reservationId: string, worstPaise: number): Promise<boolean> {
    try {
      await budget.settle(reservationId, worstPaise);
      return true;
    } catch {
      return false;
    }
  }

  async function settleAndRespond(
    log: Logger,
    reply: Replier,
    plan: CallPlan,
    reservationId: string,
    answer: ProviderReply,
    requestId: string,
    started: number,
    attempt: number,
    worstPaise: number,
  ): Promise<unknown> {
    const actualPaise = microUsdToPaise(
      actualMicroUsd(plan.model, answer.promptTokens, answer.completionTokens),
      config.paisePerUsd,
    );
    if (actualPaise > worstPaise) {
      // Should not happen when the provider honours max_tokens. Recorded so the owner can see it.
      log.warn(
        { requestId, client: plan.client, actualPaise, worstPaise },
        "actual cost exceeded its reservation",
      );
    }
    try {
      await budget.settle(reservationId, actualPaise);
    } catch {
      // The provider was paid for but the ledger write failed. The reservation stays open (the reaper settles it
      // later at worst case), and the answer is withheld. Fail closed.
      log.error({ requestId, client: plan.client }, "ledger settlement failed; answer withheld");
      return reply.code(503).send({ error: "try_later", code: "LEDGER_UNAVAILABLE" });
    }
    log.info(
      {
        requestId,
        client: plan.client,
        model: plan.model.id,
        outcome: "ok",
        attempt,
        promptTokens: answer.promptTokens,
        completionTokens: answer.completionTokens,
        costPaise: actualPaise,
        latencyMs: now() - started,
        source: answer.source,
      },
      "provider call",
    );
    return reply.code(200).send({
      requestId,
      text: answer.text,
      usage: { promptTokens: answer.promptTokens, completionTokens: answer.completionTokens },
      costPaise: actualPaise,
      source: answer.source,
    });
  }

  function refusal(
    reply: { code: (status: number) => { send: (body: object) => unknown } },
    reason: ReserveRefusal,
  ): unknown {
    if (reason === "QUOTA_EXCEEDED") {
      return reply.code(429).send({ error: "try_later", code: "QUOTA_EXCEEDED" });
    }
    return reply.code(503).send({ error: "try_later", code: "BUDGET_EXHAUSTED" });
  }

  return app;
}

export function utcMonth(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 7);
}

function utcDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function base64DecodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
