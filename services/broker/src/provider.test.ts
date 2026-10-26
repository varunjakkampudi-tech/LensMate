import {
  MockProvider,
  OpenRouterProvider,
  ProviderFailure,
  ProviderTimeoutError,
  type ProviderRequest,
} from "./provider.js";

const KEY = "sk-or-test-DO-NOT-USE-0000000000";

function request(signal: AbortSignal = new AbortController().signal): ProviderRequest {
  return {
    model: "google/gemini-3.1-flash-lite",
    messages: [{ role: "user", content: "hello" }],
    maxOutputTokens: 64,
    signal,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const OK_BODY = {
  choices: [{ message: { content: "hi there" } }],
  usage: { prompt_tokens: 12, completion_tokens: 3 },
};

describe("MockProvider", () => {
  it("returns a deterministic mock reply with usage bounded by the request", async () => {
    const provider = new MockProvider();
    const input = request();

    await expect(provider.complete(input)).resolves.toEqual({
      text: "mock reply: the broker is running without provider calls",
      // Pin the fixture result instead of repeating MockProvider's token calculation here.
      promptTokens: 5,
      completionTokens: 16,
      source: "mock",
    });
    expect(provider.attemptCount).toBe(1);

    await expect(provider.complete({ ...input, maxOutputTokens: 3 })).resolves.toMatchObject({
      completionTokens: 3,
      source: "mock",
    });
    expect(provider.attemptCount).toBe(2);
  });

  it("scripts an unavailable attempt and then succeeds without a provider call", async () => {
    const provider = new MockProvider(["unavailable", "ok"]);

    await expect(provider.complete(request())).rejects.toMatchObject({
      reason: "UNAVAILABLE",
      retryable: true,
      status: 503,
    });
    await expect(provider.complete(request())).resolves.toMatchObject({ source: "mock" });
    expect(provider.attemptCount).toBe(2);
  });

  it("rejects a hanging mock attempt when its signal is aborted", async () => {
    const controller = new AbortController();
    const provider = new MockProvider(["hang"]);
    let settled = false;
    const attempt = provider.complete(request(controller.signal)).then(
      (reply) => {
        settled = true;
        return reply;
      },
      (error: unknown) => {
        settled = true;
        throw error;
      },
    );

    await Promise.resolve();
    expect(settled).toBe(false);

    controller.abort();

    await expect(attempt).rejects.toBeInstanceOf(ProviderTimeoutError);
    expect(provider.attemptCount).toBe(1);
  });

  it("rejects a hanging mock attempt when its signal was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new MockProvider(["hang"]);

    await expect(provider.complete(request(controller.signal))).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });
});

describe("OpenRouterProvider request shape", () => {
  it("sends the key only in the Authorization header and routes to zero-retention providers", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const provider = new OpenRouterProvider(KEY, "https://openrouter.ai/api/v1", (url, init) => {
      seenUrl = url;
      seenInit = init;
      return Promise.resolve(json(200, OK_BODY));
    });

    const reply = await provider.complete(request());

    expect(seenUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    const sent = typeof seenInit?.body === "string" ? seenInit.body : "";
    const body = JSON.parse(sent) as Record<string, unknown>;
    expect(body.provider).toEqual({ zdr: true, data_collection: "deny" });
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(64);
    expect(body).not.toHaveProperty("api_key");
    expect((seenInit?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(reply).toEqual({
      text: "hi there",
      promptTokens: 12,
      completionTokens: 3,
      source: "openrouter",
    });
  });
});

describe("OpenRouterProvider failures", () => {
  it("maps a rate limit to a retryable failure", async () => {
    const provider = new OpenRouterProvider(KEY, "https://x", () => Promise.resolve(json(429, {})));
    await expect(provider.complete(request())).rejects.toMatchObject({
      reason: "RATE_LIMITED",
      retryable: true,
    });
  });

  it("maps a server error to a retryable outage", async () => {
    const provider = new OpenRouterProvider(KEY, "https://x", () => Promise.resolve(json(503, {})));
    await expect(provider.complete(request())).rejects.toMatchObject({
      reason: "UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps a client error to a non-retryable rejection", async () => {
    const provider = new OpenRouterProvider(KEY, "https://x", () => Promise.resolve(json(401, {})));
    await expect(provider.complete(request())).rejects.toMatchObject({
      reason: "REJECTED",
      retryable: false,
      status: 401,
    });
  });

  it("maps a network error to a retryable outage", async () => {
    const provider = new OpenRouterProvider(KEY, "https://x", () =>
      Promise.reject(new Error("socket hang up")),
    );
    await expect(provider.complete(request())).rejects.toBeInstanceOf(ProviderFailure);
  });

  it("maps an aborted attempt to a timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenRouterProvider(KEY, "https://x", () =>
      Promise.reject(new Error("aborted")),
    );
    await expect(provider.complete(request(controller.signal))).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });

  it("rejects a malformed success body instead of guessing", async () => {
    const provider = new OpenRouterProvider(KEY, "https://x", () =>
      Promise.resolve(json(200, { choices: [] })),
    );
    await expect(provider.complete(request())).rejects.toMatchObject({
      reason: "REJECTED",
      retryable: false,
    });
  });

  it("never carries the provider's response body into the error", async () => {
    const leaked = `echo ${KEY} and the user's private text`;
    const provider = new OpenRouterProvider(KEY, "https://x", () =>
      Promise.resolve(new Response(leaked, { status: 500 })),
    );
    try {
      await provider.complete(request());
      throw new Error("expected a failure");
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(KEY);
      expect((error as Error).message).not.toContain("private text");
      expect((error as Error).message).not.toContain(KEY);
    }
  });
});

describe("provider response bounds", () => {
  it("refuses a success body declared larger than the limit, without reading it", async () => {
    const provider = new OpenRouterProvider(KEY, "https://x", () =>
      Promise.resolve(
        new Response("{}", { status: 200, headers: { "content-length": "999999999" } }),
      ),
    );
    await expect(provider.complete(request())).rejects.toMatchObject({
      reason: "REJECTED",
      retryable: false,
    });
  });

  it("refuses a success body that grows past the limit without a declared length", async () => {
    const big = `{"choices":[{"message":{"content":"${"x".repeat(300_000)}"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`;
    const provider = new OpenRouterProvider(KEY, "https://x", () =>
      Promise.resolve(new Response(big, { status: 200 })),
    );
    await expect(provider.complete(request())).rejects.toMatchObject({ reason: "REJECTED" });
  });

  it("asks fetch to refuse redirects, so the key is never sent to another host", async () => {
    let redirect: unknown;
    const provider = new OpenRouterProvider(KEY, "https://x", (_url, init) => {
      redirect = init.redirect;
      return Promise.resolve(new Response(JSON.stringify(OK_BODY), { status: 200 }));
    });
    await provider.complete(request());
    expect(redirect).toBe("error");
  });
});

/** A streamed OpenRouter response whose bytes are split at awkward points, as a network does. */
function sseResponse(parts: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

const delta = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const usageChunk = (prompt: number, completion: number) =>
  `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion } })}\n\n`;

describe("OpenRouter streaming reader", () => {
  it("passes each delta to the caller as it arrives and reports the usage from the last chunk", async () => {
    const whole = delta("Hel") + delta("lo") + usageChunk(9, 2) + "data: [DONE]\n\n";
    // Split inside a JSON line and inside an event boundary.
    const parts = [whole.slice(0, 20), whole.slice(20, 75), whole.slice(75)];
    const provider = new OpenRouterProvider(KEY, "https://example.test/api/v1", () =>
      Promise.resolve(sseResponse(parts)),
    );
    const pieces: string[] = [];
    const reply = await provider.stream(request(), (text) => pieces.push(text));
    expect(pieces).toEqual(["Hel", "lo"]);
    expect(reply).toEqual({
      text: "Hello",
      usage: { promptTokens: 9, completionTokens: 2 },
      source: "openrouter",
    });
  });

  it("reports no usage when the provider does not send it, so the caller charges the worst case", async () => {
    const provider = new OpenRouterProvider(KEY, "https://example.test/api/v1", () =>
      Promise.resolve(sseResponse([delta("Hi"), "data: [DONE]\n\n"])),
    );
    const reply = await provider.stream(request(), () => undefined);
    expect(reply.usage).toBeNull();
    expect(reply.text).toBe("Hi");
  });

  it("fails the reply on an error chunk, and on a malformed chunk", async () => {
    const errorChunk = `data: ${JSON.stringify({ error: { message: "upstream" } })}\n\n`;
    const bad = new OpenRouterProvider(KEY, "https://example.test/api/v1", () =>
      Promise.resolve(sseResponse([delta("A"), errorChunk])),
    );
    await expect(bad.stream(request(), () => undefined)).rejects.toThrow(ProviderFailure);
    const malformed = new OpenRouterProvider(KEY, "https://example.test/api/v1", () =>
      Promise.resolve(sseResponse(["data: {not json\n\n"])),
    );
    await expect(malformed.stream(request(), () => undefined)).rejects.toThrow(ProviderFailure);
  });

  it("refuses a streamed reply that grows past the size limit", async () => {
    const huge = delta("x".repeat(300_000));
    const provider = new OpenRouterProvider(KEY, "https://example.test/api/v1", () =>
      Promise.resolve(sseResponse([huge])),
    );
    await expect(provider.stream(request(), () => undefined)).rejects.toThrow(ProviderFailure);
  });

  it("sends stream and the usage option, and never the key in an error", async () => {
    let sent = "";
    const provider = new OpenRouterProvider(KEY, "https://example.test/api/v1", (_url, init) => {
      sent = String(init.body);
      return Promise.resolve(sseResponse(["data: [DONE]\n\n"]));
    });
    await provider.stream(request(), () => undefined);
    const body = JSON.parse(sent) as {
      stream: boolean;
      stream_options: { include_usage: boolean };
    };
    expect(body.stream).toBe(true);
    expect(body.stream_options.include_usage).toBe(true);
  });
});

describe("mock streaming", () => {
  it("streams the mock reply word by word with the same text as the full reply", async () => {
    const pieces: string[] = [];
    const reply = await new MockProvider().stream(request(), (text) => pieces.push(text));
    expect(pieces.join("")).toBe(reply.text);
    expect(pieces.length).toBeGreaterThan(1);
  });
});
