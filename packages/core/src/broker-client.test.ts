import {
  BrokerError,
  brokerProviderRun,
  enrolDevice,
  requestBrokerChat,
  type BrokerChatRequest,
} from "./broker-client.js";
import { ProviderGateway } from "./provider-gateway.js";
import { SpendCap } from "./spend-cap.js";

const TOKEN = "app-1.not-a-real-secret-0123456789";
const BODY: BrokerChatRequest = {
  model: "google/gemini-3.1-flash-lite",
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 32,
};
const OK = { requestId: "r-1", text: "hi", costPaise: 3, source: "mock" };

function reply(status: number, body: unknown): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
    )) satisfies typeof fetch;
}

const signal = new AbortController().signal;

describe("requestBrokerChat", () => {
  it("sends the token only in the Authorization header and returns the reply", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = ((_url: string, init: RequestInit) => {
      seen = init;
      return Promise.resolve(new Response(JSON.stringify(OK), { status: 200 }));
    }) as typeof fetch;

    const result = await requestBrokerChat(
      { baseUrl: "https://broker.example/", token: TOKEN, fetch: fetchImpl },
      BODY,
      signal,
    );

    expect(result).toEqual(OK);
    expect((seen?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const sent = typeof seen?.body === "string" ? seen.body : "";
    expect(sent).not.toContain(TOKEN);
  });

  it("maps a budget refusal to a non-retryable cap error", async () => {
    await expect(
      requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(503, { code: "BUDGET_EXHAUSTED" }) },
        BODY,
        signal,
      ),
    ).rejects.toMatchObject({ gatewayCode: "CAP_REACHED", retryable: false });
  });

  it("maps a quota refusal to a non-retryable quota error", async () => {
    await expect(
      requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(429, { code: "QUOTA_EXCEEDED" }) },
        BODY,
        signal,
      ),
    ).rejects.toMatchObject({ gatewayCode: "QUOTA_EXCEEDED", retryable: false });
  });

  it("maps a rejected token to a non-retryable unauthorized error", async () => {
    await expect(
      requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(401, { code: "UNAUTHORIZED" }) },
        BODY,
        signal,
      ),
    ).rejects.toMatchObject({ gatewayCode: "UNAUTHORIZED", retryable: false });
  });

  it("maps a provider outage to a retryable error", async () => {
    await expect(
      requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(503, { code: "PROVIDER_UNAVAILABLE" }) },
        BODY,
        signal,
      ),
    ).rejects.toMatchObject({ gatewayCode: "PROVIDER_ERROR", retryable: true });
  });

  it("maps a network failure to a retryable error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    await expect(
      requestBrokerChat({ baseUrl: "https://b", token: TOKEN, fetch: fetchImpl }, BODY, signal),
    ).rejects.toMatchObject({ gatewayCode: "PROVIDER_ERROR", retryable: true });
  });

  it("refuses a success body that is not a well-formed reply", async () => {
    await expect(
      requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(200, "not json") },
        BODY,
        signal,
      ),
    ).rejects.toBeInstanceOf(BrokerError);
    await expect(
      requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(200, { ...OK, costPaise: -1 }) },
        BODY,
        signal,
      ),
    ).rejects.toMatchObject({ code: "MALFORMED_REPLY" });
  });

  it("never puts the token into the error it throws", async () => {
    try {
      await requestBrokerChat(
        { baseUrl: "https://b", token: TOKEN, fetch: reply(401, { code: "UNAUTHORIZED" }) },
        BODY,
        signal,
      );
      throw new Error("expected a refusal");
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
      expect((error as Error).message).not.toContain(TOKEN);
    }
  });
});

describe("broker calls through the gateway", () => {
  const gatewayOptions = {
    timeoutMs: 1000,
    maxAttempts: 2 as const,
    circuitFailureThreshold: 10,
    circuitCooldownMs: 1000,
    now: () => 0,
  };

  it("reports the reply with its cost and records the spend against the cap", async () => {
    const cap = new SpendCap(100);
    const gateway = new ProviderGateway(cap, gatewayOptions);
    gateway.acceptDisclosure("translation");
    const result = await gateway.call(
      "translation",
      10,
      brokerProviderRun({ baseUrl: "https://b", token: TOKEN, fetch: reply(200, OK) }, BODY),
    );
    expect(result).toEqual({ ok: true, value: OK, costMinor: 3 });
    expect(cap.spent).toBe(3);
  });

  it("stops at once on a budget refusal instead of retrying", async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ code: "BUDGET_EXHAUSTED" }), { status: 503 }),
      );
    }) as typeof fetch;
    const gateway = new ProviderGateway(new SpendCap(100), gatewayOptions);
    gateway.acceptDisclosure("translation");
    const result = await gateway.call(
      "translation",
      10,
      brokerProviderRun({ baseUrl: "https://b", token: TOKEN, fetch: fetchImpl }, BODY),
    );
    expect(result).toEqual({ ok: false, errorCode: "CAP_REACHED" });
    expect(calls).toBe(1);
  });

  it("retries a provider outage up to the gateway's attempt limit", async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ code: "PROVIDER_UNAVAILABLE" }), { status: 503 }),
      );
    }) as typeof fetch;
    const gateway = new ProviderGateway(new SpendCap(100), gatewayOptions);
    gateway.acceptDisclosure("translation");
    const result = await gateway.call(
      "translation",
      10,
      brokerProviderRun({ baseUrl: "https://b", token: TOKEN, fetch: fetchImpl }, BODY),
    );
    expect(result).toEqual({ ok: false, errorCode: "PROVIDER_ERROR" });
    expect(calls).toBe(2);
  });
});

describe("review follow-ups: timeouts and circuit scope", () => {
  const gatewayOptions = {
    timeoutMs: 1000,
    maxAttempts: 3 as const,
    circuitFailureThreshold: 2,
    circuitCooldownMs: 60_000,
    now: () => 0,
  };

  it("does not retry a broker timeout, because the broker already retried within its own bound", async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify({ code: "TIMEOUT" }), { status: 503 }));
    }) as typeof fetch;
    const gateway = new ProviderGateway(new SpendCap(100), gatewayOptions);
    gateway.acceptDisclosure("translation");
    const result = await gateway.call(
      "translation",
      10,
      brokerProviderRun({ baseUrl: "https://b", token: TOKEN, fetch: fetchImpl }, BODY),
    );
    expect(result).toEqual({ ok: false, errorCode: "TIMEOUT" });
    expect(calls).toBe(1);
  });

  it("does not open the circuit on budget refusals, so the real reason keeps being reported", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: "BUDGET_EXHAUSTED" }), { status: 503 }),
      )) as typeof fetch;
    const gateway = new ProviderGateway(new SpendCap(100), gatewayOptions);
    gateway.acceptDisclosure("translation");
    const run = brokerProviderRun({ baseUrl: "https://b", token: TOKEN, fetch: fetchImpl }, BODY);
    for (let index = 0; index < 4; index += 1) {
      expect(await gateway.call("translation", 10, run)).toEqual({
        ok: false,
        errorCode: "CAP_REACHED",
      });
    }
  });
});

describe("device enrolment", () => {
  it("returns the device's own credential for a valid code", async () => {
    const fetchImpl = reply(200, {
      deviceId: "d-1",
      deviceSecret: "not-a-real-device-secret-".repeat(3),
    });
    expect(await enrolDevice("https://b", "ABCD-EFGH-JKMN-PQRS", "phone", fetchImpl)).toEqual({
      deviceId: "d-1",
      deviceSecret: "not-a-real-device-secret-".repeat(3),
    });
  });

  it("sends the code and label in the body, and never as a query string", async () => {
    let seenUrl = "";
    let seenBody = "";
    const fetchImpl = ((url: string, init: RequestInit) => {
      seenUrl = url;
      seenBody = typeof init.body === "string" ? init.body : "";
      return Promise.resolve(
        new Response(JSON.stringify({ deviceId: "d", deviceSecret: "s".repeat(40) }), {
          status: 200,
        }),
      );
    }) as typeof fetch;
    await enrolDevice("https://b", "ABCD-EFGH-JKMN-PQRS", "phone", fetchImpl);
    expect(seenUrl).toBe("https://b/v1/enrol");
    expect(seenUrl).not.toContain("ABCD");
    expect(JSON.parse(seenBody)).toEqual({ code: "ABCD-EFGH-JKMN-PQRS", label: "phone" });
  });

  it("refuses a used, wrong or expired code with a non-retryable error", async () => {
    await expect(
      enrolDevice(
        "https://b",
        "AAAA-AAAA-AAAA-AAAA",
        "x",
        reply(403, { code: "ENROLMENT_REFUSED" }),
      ),
    ).rejects.toMatchObject({ gatewayCode: "PROVIDER_ERROR", retryable: false });
  });
});
