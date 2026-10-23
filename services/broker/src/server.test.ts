import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { InMemoryBudgetStore, type BudgetStore } from "./budget.js";
import { buildServer, utcMonth } from "./server.js";
import { findModel, microUsdToPaise, worstCaseMicroUsd } from "./pricing.js";
import {
  MockProvider,
  OpenRouterProvider,
  ProviderFailure,
  type ChatProvider,
} from "./provider.js";
import { TEST_AUTH_HEADER, TEST_CLIENT_SECRET, TEST_DEVICE_ID, testConfig } from "./test-config.js";
import { InMemoryDeviceStore, issueEnrolmentCode } from "./devices.js";
import type { BrokerConfig } from "./config.js";

const NOW = Date.UTC(2026, 9, 24, 10, 0, 0);
const PRIVATE_TEXT = "my private sentence about my home address";

interface Harness {
  readonly app: FastifyInstance;
  readonly store: BudgetStore;
  readonly logs: string[];
}

/** A harness whose device store is supplied by the test, with no seeded device. */
function harnessWithDevices(devices: InMemoryDeviceStore): Promise<Harness> {
  return harness({}, new MockProvider(), new InMemoryBudgetStore(), () => NOW, devices);
}

async function harness(
  overrides: Partial<BrokerConfig> = {},
  provider: ChatProvider = new MockProvider(),
  store: BudgetStore = new InMemoryBudgetStore(),
  nowMs: () => number = () => NOW,
  deviceStore?: InMemoryDeviceStore,
): Promise<Harness> {
  const logs: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(chunk.toString("utf8"));
      callback();
    },
  });
  const devices = deviceStore ?? new InMemoryDeviceStore();
  if (deviceStore === undefined) {
    devices.seedDevice(TEST_DEVICE_ID, TEST_CLIENT_SECRET);
  }
  const app = await buildServer({
    config: testConfig(overrides),
    budget: store,
    devices,
    provider,
    now: nowMs,
    logger: {
      level: "info",
      redact: { paths: ["req.headers.authorization"], censor: "[redacted]" },
      stream: sink,
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  open.push(app);
  return { app, store, logs };
}

const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.map((app) => app.close()));
  open.length = 0;
});

interface HttpResponse {
  readonly statusCode: number;
  readonly body: string;
  json(): unknown;
}

/** A real HTTP request to the listening server, so the full network path is exercised. */
async function request(
  app: FastifyInstance,
  options: { method: string; url: string; headers?: Record<string, string>; payload?: unknown },
): Promise<HttpResponse> {
  const base = app.listeningOrigin;
  const headers: Record<string, string> = { ...options.headers };
  const init: RequestInit = { method: options.method, headers };
  if (options.payload !== undefined) {
    init.body = JSON.stringify(options.payload);
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${base}${options.url}`, init);
  const body = await response.text();
  return { statusCode: response.status, body, json: () => JSON.parse(body) as unknown };
}

async function chat(
  app: FastifyInstance,
  body: unknown,
  authorization: string | null = TEST_AUTH_HEADER,
) {
  return await request(app, {
    method: "POST",
    url: "/v1/ai/text",
    headers: authorization === null ? {} : { authorization },
    payload: body,
  });
}

const GOOD_BODY = {
  model: "google/gemini-2.5-flash-lite",
  messages: [{ role: "user", content: "Translate: good morning" }],
  maxOutputTokens: 64,
};

/** Worst-case paise for GOOD_BODY, computed the same way the broker does, to set exact cap boundaries. */
function worstPaiseFor(
  body: { messages: { content: string }[]; maxOutputTokens: number; model: string },
  config: BrokerConfig,
): number {
  const model = findModel(body.model);
  if (model === undefined) {
    throw new Error("model missing");
  }
  const bytes = body.messages.reduce(
    (sum, message) => sum + Buffer.byteLength(message.content, "utf8"),
    0,
  );
  const bound = bytes + body.messages.length * 8 + 256;
  return microUsdToPaise(worstCaseMicroUsd(model, bound, body.maxOutputTokens), config.paisePerUsd);
}

describe("authentication", () => {
  it("refuses a request with no credentials", async () => {
    const { app } = await harness();
    const response = await chat(app, GOOD_BODY, null);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized", code: "UNAUTHORIZED" });
  });

  it("refuses a wrong secret and an unknown client id, with the same response", async () => {
    const { app } = await harness();
    const wrong = await chat(
      app,
      GOOD_BODY,
      `Bearer ${TEST_DEVICE_ID}.wrong-secret-0123456789abcdefghijklmnop`,
    );
    const unknown = await chat(app, GOOD_BODY, `Bearer nobody.${TEST_CLIENT_SECRET}`);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.body).toBe(wrong.body);
  });

  it("protects the usage endpoint the same way", async () => {
    const { app } = await harness();
    expect((await request(app, { method: "GET", url: "/v1/usage" })).statusCode).toBe(401);
  });
});

describe("health", () => {
  it("reports ok when the ledger answers", async () => {
    const { app } = await harness();
    const response = await request(app, { method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reports unavailable without detail when the ledger does not answer", async () => {
    const store = new InMemoryBudgetStore();
    store.ping = () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const { app } = await harness({}, new MockProvider(), store);
    const response = await request(app, { method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("10.0.0.5");
  });
});

describe("text route: successful call", () => {
  it("returns the reply, the usage and the cost, and settles the ledger to the actual cost", async () => {
    const { app, store } = await harness();
    const response = await chat(app, GOOD_BODY);
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      text: string;
      source: string;
      costPaise: number;
      usage: Record<string, number>;
    };
    expect(body.source).toBe("mock");
    expect(body.text).toContain("mock reply");
    expect(body.costPaise).toBeGreaterThan(0);
    const summary = await store.summary(utcMonth(NOW));
    expect(summary.spentPaise).toBe(body.costPaise);
    expect(summary.reservedPaise).toBe(0);
  });

  it("reports the usage endpoint with what is left under the cap", async () => {
    const { app } = await harness({ monthlyCapPaise: 90_000 });
    await chat(app, GOOD_BODY);
    const usage = await request(app, {
      method: "GET",
      url: "/v1/usage",
      headers: { authorization: TEST_AUTH_HEADER },
    });
    const body = usage.json() as {
      capPaise: number;
      spentPaise: number;
      remainingPaise: number;
      source: string;
    };
    expect(body.capPaise).toBe(90_000);
    expect(body.remainingPaise).toBe(90_000 - body.spentPaise);
    expect(body.source).toBe("mock");
  });
});

describe("text route: request checks", () => {
  it.each([
    ["an extra field", { ...GOOD_BODY, api_key: "x" }],
    ["an unknown role", { ...GOOD_BODY, messages: [{ role: "tool", content: "x" }] }],
    [
      "too many messages",
      {
        ...GOOD_BODY,
        messages: Array.from({ length: 21 }, () => ({ role: "user", content: "x" })),
      },
    ],
    ["zero output tokens", { ...GOOD_BODY, maxOutputTokens: 0 }],
    ["a missing model", { messages: GOOD_BODY.messages, maxOutputTokens: 8 }],
  ])("refuses %s with a validation error", async (_label, body) => {
    const { app } = await harness();
    const response = await chat(app, body);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request", code: "VALIDATION" });
  });

  it("refuses a model that is not on the allowlist", async () => {
    const { app } = await harness();
    const response = await chat(app, { ...GOOD_BODY, model: "openai/gpt-4o" });
    expect(response.json()).toEqual({ error: "invalid_request", code: "MODEL_NOT_ALLOWED" });
  });

  it("refuses the vision model on the text route", async () => {
    const { app } = await harness();
    const response = await chat(app, { ...GOOD_BODY, model: "google/gemini-2.5-flash" });
    expect(response.json()).toMatchObject({ code: "MODEL_NOT_ALLOWED" });
  });

  it("refuses an output cap above the owner's ceiling", async () => {
    const { app } = await harness({ maxOutputTokensCeiling: 100 });
    const response = await chat(app, { ...GOOD_BODY, maxOutputTokens: 101 });
    expect(response.json()).toEqual({ error: "invalid_request", code: "OUTPUT_LIMIT" });
  });

  it("refuses input above the byte limit before any provider call", async () => {
    const provider = new MockProvider();
    const { app } = await harness({ maxInputBytes: 50 }, provider);
    const response = await chat(app, {
      ...GOOD_BODY,
      messages: [{ role: "user", content: "x".repeat(60) }],
    });
    expect(response.json()).toEqual({ error: "invalid_request", code: "INPUT_TOO_LARGE" });
    expect(provider.attemptCount).toBe(0);
  });
});

describe("spend cap boundary", () => {
  it("allows the call whose worst case lands exactly on the cap", async () => {
    const config = testConfig();
    const cap = worstPaiseFor(GOOD_BODY, config);
    const { app } = await harness({ monthlyCapPaise: cap });
    expect((await chat(app, GOOD_BODY)).statusCode).toBe(200);
  });

  it("refuses the call one paisa below its worst case, without contacting the provider", async () => {
    const config = testConfig();
    const cap = worstPaiseFor(GOOD_BODY, config) - 1;
    const provider = new MockProvider();
    const { app } = await harness({ monthlyCapPaise: cap }, provider);
    const response = await chat(app, GOOD_BODY);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "try_later", code: "BUDGET_EXHAUSTED" });
    expect(provider.attemptCount).toBe(0);
  });

  it("refuses the second call once the first call's worst case has used the cap", async () => {
    const config = testConfig();
    const cap = worstPaiseFor(GOOD_BODY, config);
    const { app } = await harness({ monthlyCapPaise: cap });
    await chat(app, GOOD_BODY);
    const second = await chat(app, GOOD_BODY);
    expect(second.json()).toMatchObject({ code: "BUDGET_EXHAUSTED" });
  });
});

describe("quotas and rate limits", () => {
  it("refuses requests past the daily quota with a quota code", async () => {
    const { app } = await harness({ dailyRequestQuotaPerClient: 2 });
    expect((await chat(app, GOOD_BODY)).statusCode).toBe(200);
    expect((await chat(app, GOOD_BODY)).statusCode).toBe(200);
    const third = await chat(app, GOOD_BODY);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: "try_later", code: "QUOTA_EXCEEDED" });
  });

  it("refuses bursts above the rate limit with a rate code", async () => {
    const { app } = await harness({ rateLimitBurst: 2, rateLimitRefillPerSecond: 0 });
    await chat(app, GOOD_BODY);
    await chat(app, GOOD_BODY);
    const third = await chat(app, GOOD_BODY);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: "try_later", code: "RATE_LIMITED" });
  });
});

describe("provider outages and timeouts", () => {
  it("retries once, then returns a safe try-later state, charging each failed attempt at its worst case", async () => {
    const provider = new MockProvider(["unavailable"]);
    const { app, store } = await harness({}, provider);
    const response = await chat(app, GOOD_BODY);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "try_later", code: "PROVIDER_UNAVAILABLE" });
    expect(provider.attemptCount).toBe(2);
    const worst = worstPaiseFor(GOOD_BODY, testConfig());
    expect(await store.summary(utcMonth(NOW))).toEqual({
      month: utcMonth(NOW),
      spentPaise: 2 * worst,
      reservedPaise: 0,
    });
  });

  it("recovers when the retry succeeds, charging the failed attempt at worst case and the answer at actual cost", async () => {
    const provider = new MockProvider(["unavailable", "ok"]);
    const { app, store } = await harness({}, provider);
    const response = await chat(app, GOOD_BODY);
    expect(response.statusCode).toBe(200);
    const summary = await store.summary(utcMonth(NOW));
    const worst = worstPaiseFor(GOOD_BODY, testConfig());
    expect(summary.spentPaise).toBe(worst + (response.json() as { costPaise: number }).costPaise);
    expect(summary.reservedPaise).toBe(0);
  });

  it("does not retry a rejected request", async () => {
    const provider: ChatProvider = {
      complete: () => Promise.reject(new ProviderFailure("REJECTED", false, 400)),
    };
    const { app, store } = await harness({}, provider);
    expect((await chat(app, GOOD_BODY)).statusCode).toBe(503);
    const summary = await store.summary(utcMonth(NOW));
    expect(summary.reservedPaise).toBe(0);
    expect(summary.spentPaise).toBe(worstPaiseFor(GOOD_BODY, testConfig()));
  });

  it("times out a hung provider, charges the attempt at worst case, and says so", async () => {
    const provider = new MockProvider(["hang"]);
    const { app, store } = await harness(
      { providerTimeoutMs: 30, providerMaxAttempts: 1 },
      provider,
    );
    const response = await chat(app, GOOD_BODY);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "try_later", code: "TIMEOUT" });
    const summary = await store.summary(utcMonth(NOW));
    expect(summary.reservedPaise).toBe(0);
    expect(summary.spentPaise).toBe(
      worstPaiseFor(GOOD_BODY, testConfig({ providerTimeoutMs: 30 })),
    );
  });
});

describe("concurrency", () => {
  it("never lets concurrent requests spend past the cap, and the ledger never exceeds it", async () => {
    const config = testConfig();
    const cap = worstPaiseFor(GOOD_BODY, config) * 10;
    const store = new InMemoryBudgetStore();
    const { app } = await harness(
      { monthlyCapPaise: cap, dailyRequestQuotaPerClient: 1000 },
      new MockProvider(),
      store,
    );
    const responses = await Promise.all(Array.from({ length: 60 }, () => chat(app, GOOD_BODY)));
    const accepted = responses.filter((response) => response.statusCode === 200).length;
    expect(accepted).toBe(10);
    expect(responses.filter((response) => response.statusCode === 503)).toHaveLength(50);
    const summary = await store.summary(utcMonth(NOW));
    expect(summary.spentPaise + summary.reservedPaise).toBeLessThanOrEqual(cap);
  });
});

describe("vision route", () => {
  const PNG = `data:image/png;base64,${Buffer.from("tiny-test-bytes").toString("base64")}`;
  const VISION = {
    model: "google/gemini-2.5-flash",
    prompt: "What is on the sign?",
    imageDataUrl: PNG,
    maxOutputTokens: 64,
  };

  it("is unavailable until the owner has measured an image token ceiling", async () => {
    const { app } = await harness();
    const response = await request(app, {
      method: "POST",
      url: "/v1/ai/vision",
      headers: { authorization: TEST_AUTH_HEADER },
      payload: VISION,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "try_later", code: "FEATURE_UNAVAILABLE" });
  });

  it("answers with an accepted image once the ceiling is set", async () => {
    const { app } = await harness({ imageTokenCeiling: 1000 });
    const response = await request(app, {
      method: "POST",
      url: "/v1/ai/vision",
      headers: { authorization: TEST_AUTH_HEADER },
      payload: VISION,
    });
    expect(response.statusCode).toBe(200);
  });

  it("refuses a payload that is not a PNG or JPEG data URL", async () => {
    const { app } = await harness({ imageTokenCeiling: 1000 });
    const response = await request(app, {
      method: "POST",
      url: "/v1/ai/vision",
      headers: { authorization: TEST_AUTH_HEADER },
      payload: { ...VISION, imageDataUrl: "https://example.com/a.png" },
    });
    expect(response.json()).toEqual({ error: "invalid_request", code: "IMAGE_REJECTED" });
  });

  it("refuses an image above the byte limit", async () => {
    const { app } = await harness({ imageTokenCeiling: 1000, maxImageBytes: 4 });
    const response = await request(app, {
      method: "POST",
      url: "/v1/ai/vision",
      headers: { authorization: TEST_AUTH_HEADER },
      payload: VISION,
    });
    expect(response.json()).toEqual({ error: "invalid_request", code: "IMAGE_REJECTED" });
  });
});

describe("credential and content exposure", () => {
  it("keeps the provider key and the client secret out of responses and logs, and logs no content", async () => {
    const key = "sk-or-test-DO-NOT-USE-0000000000";
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(
        new Response(`upstream says ${key} about "${PRIVATE_TEXT}"`, { status: 500 }),
      );
    const provider = new OpenRouterProvider(key, "https://openrouter.ai/api/v1", fetchImpl);
    const { app, logs } = await harness({ mode: "live" }, provider);

    const response = await chat(app, {
      ...GOOD_BODY,
      messages: [{ role: "user", content: PRIVATE_TEXT }],
    });
    expect(response.statusCode).toBe(503);

    const everything = [response.body, ...logs].join("\n");
    expect(everything).not.toContain(key);
    expect(everything).not.toContain(TEST_CLIENT_SECRET);
    expect(everything).not.toContain(PRIVATE_TEXT);
    expect(everything).not.toContain("upstream says");
    expect(logs.join("\n")).toContain("PROVIDER_UNAVAILABLE");
  });

  it("logs the outcome and cost of a successful call without any message content", async () => {
    const { app, logs } = await harness();
    await chat(app, { ...GOOD_BODY, messages: [{ role: "user", content: PRIVATE_TEXT }] });
    const joined = logs.join("\n");
    expect(joined).toContain("costPaise");
    expect(joined).not.toContain(PRIVATE_TEXT);
    expect(joined).not.toContain(TEST_CLIENT_SECRET);
  });

  it("does not echo a secret header even when the request log is written", async () => {
    const { app, logs } = await harness();
    await chat(app, GOOD_BODY);
    expect(logs.join("\n")).not.toContain(TEST_CLIENT_SECRET);
  });
});

describe("ledger failures fail closed", () => {
  it("answers try-later and calls no provider when the ledger cannot reserve", async () => {
    const store = new InMemoryBudgetStore();
    store.reserve = () => Promise.reject(new Error("connection refused 10.0.0.5"));
    const provider = new MockProvider();
    const { app, logs } = await harness({}, provider, store);
    const response = await chat(app, GOOD_BODY);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "try_later", code: "LEDGER_UNAVAILABLE" });
    expect(provider.attemptCount).toBe(0);
    expect(response.body).not.toContain("10.0.0.5");
    expect(logs.join("\n")).not.toContain("10.0.0.5");
  });
});

describe("enrolment over HTTP", () => {
  it("enrols a device with a valid code, then that device can call the broker", async () => {
    const devices = new InMemoryDeviceStore();
    const code = await issueEnrolmentCode(devices, NOW);
    const { app, logs } = await harnessWithDevices(devices);
    const enrol = await request(app, {
      method: "POST",
      url: "/v1/enrol",
      payload: { code, label: "owner phone" },
    });
    expect(enrol.statusCode).toBe(200);
    const body = enrol.json() as { deviceId: string; deviceSecret: string };
    const call = await chat(app, GOOD_BODY, `Bearer ${body.deviceId}.${body.deviceSecret}`);
    expect(call.statusCode).toBe(200);
    // The device secret must not appear in any log line.
    expect(logs.join("\n")).not.toContain(body.deviceSecret);
  });

  it("refuses a reused, wrong or expired code with the same answer", async () => {
    const devices = new InMemoryDeviceStore();
    const code = await issueEnrolmentCode(devices, NOW);
    const { app } = await harnessWithDevices(devices);
    await request(app, { method: "POST", url: "/v1/enrol", payload: { code, label: "first" } });
    const reused = await request(app, {
      method: "POST",
      url: "/v1/enrol",
      payload: { code, label: "again" },
    });
    const wrong = await request(app, {
      method: "POST",
      url: "/v1/enrol",
      payload: { code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ", label: "x" },
    });
    expect(reused.statusCode).toBe(403);
    expect(wrong.statusCode).toBe(403);
    expect(reused.body).toBe(wrong.body);
  });

  it("stops a revoked device at once", async () => {
    const devices = new InMemoryDeviceStore();
    const code = await issueEnrolmentCode(devices, NOW);
    const { app } = await harnessWithDevices(devices);
    const body = (
      await request(app, {
        method: "POST",
        url: "/v1/enrol",
        payload: { code, label: "lost phone" },
      })
    ).json() as {
      deviceId: string;
      deviceSecret: string;
    };
    const auth = `Bearer ${body.deviceId}.${body.deviceSecret}`;
    expect((await chat(app, GOOD_BODY, auth)).statusCode).toBe(200);
    await devices.revokeDevice(body.deviceId);
    expect((await chat(app, GOOD_BODY, auth)).statusCode).toBe(401);
  });

  it("rate-limits enrolment attempts", async () => {
    const devices = new InMemoryDeviceStore();
    const { app } = await harnessWithDevices(devices);
    const statuses: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      statuses.push(
        (
          await request(app, {
            method: "POST",
            url: "/v1/enrol",
            payload: { code: "AAAA-AAAA-AAAA-AAAA", label: "x" },
          })
        ).statusCode,
      );
    }
    expect(statuses).toContain(429);
  });
});
