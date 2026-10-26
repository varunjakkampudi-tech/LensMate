import {
  BrokerError,
  enrolDevice,
  requestBrokerChat,
  streamBrokerChat,
  type BrokerChatRequest,
} from "./broker-client.js";

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

function sseBody(parts: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const STREAM_REQUEST: BrokerChatRequest = {
  model: "openai/gpt-4.1-nano",
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 64,
};

describe("streamBrokerChat", () => {
  it("passes each delta to the caller in order and resolves with the billed cost", async () => {
    const parts = [
      'event: delta\ndata: {"text":"Hel"}\n\nevent: de',
      'lta\ndata: {"text":"lo"}\n\n',
      'event: done\ndata: {"costPaise":4,"source":"openrouter"}\n\n',
    ];
    const options = {
      baseUrl: "https://broker.test",
      token: TOKEN,
      fetch: () => Promise.resolve(sseBody(parts)),
    };
    const pieces: string[] = [];
    const reply = await streamBrokerChat(
      options,
      STREAM_REQUEST,
      (text) => pieces.push(text),
      new AbortController().signal,
    );
    expect(pieces).toEqual(["Hel", "lo"]);
    expect(reply).toMatchObject({ text: "Hello", costPaise: 4, source: "openrouter" });
  });

  it("reads the whole reply when the runtime cannot stream the body", async () => {
    const text =
      'event: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"costPaise":1,"source":"mock"}\n\n';
    const noStream = new Response(text, { status: 200 });
    Object.defineProperty(noStream, "body", { value: null });
    const options = {
      baseUrl: "https://broker.test",
      token: TOKEN,
      fetch: () => Promise.resolve(noStream),
    };
    const pieces: string[] = [];
    const reply = await streamBrokerChat(
      options,
      STREAM_REQUEST,
      (piece) => pieces.push(piece),
      new AbortController().signal,
    );
    expect(pieces).toEqual(["Hi"]);
    expect(reply.text).toBe("Hi");
  });

  it("turns an error event into a non-retryable failure, after any text already shown", async () => {
    const parts = [
      'event: delta\ndata: {"text":"Part"}\n\n',
      'event: error\ndata: {"code":"PROVIDER_UNAVAILABLE"}\n\n',
    ];
    const options = {
      baseUrl: "https://broker.test",
      token: TOKEN,
      fetch: () => Promise.resolve(sseBody(parts)),
    };
    const pieces: string[] = [];
    const failure = await streamBrokerChat(
      options,
      STREAM_REQUEST,
      (text) => pieces.push(text),
      new AbortController().signal,
    ).catch((e: unknown) => e);
    expect(pieces).toEqual(["Part"]);
    expect(failure).toBeInstanceOf(BrokerError);
    expect((failure as BrokerError).retryable).toBe(false);
  });

  it("refuses a stream that ends without a done event, so no answer is treated as billed", async () => {
    const options = {
      baseUrl: "https://broker.test",
      token: TOKEN,
      fetch: () => Promise.resolve(sseBody(['event: delta\ndata: {"text":"x"}\n\n'])),
    };
    await expect(
      streamBrokerChat(options, STREAM_REQUEST, () => undefined, new AbortController().signal),
    ).rejects.toThrow(BrokerError);
  });

  it("reports an ordinary refusal before the stream starts", async () => {
    const options = {
      baseUrl: "https://broker.test",
      token: TOKEN,
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "try_later", code: "BUDGET_EXHAUSTED" }), {
            status: 503,
          }),
        ),
    };
    const failure = await streamBrokerChat(
      options,
      STREAM_REQUEST,
      () => undefined,
      new AbortController().signal,
    ).catch((e: unknown) => e);
    expect((failure as BrokerError).code).toBe("BUDGET_EXHAUSTED");
  });
});
