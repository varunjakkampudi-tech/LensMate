/**
 * Chat provider adapters. The broker is the only component that calls OpenRouter (Amendment C.2).
 * Errors carry a status code and a reason, never a response body, so provider output cannot reach logs.
 */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  /** Text content, or an array of text and image parts for the vision route. */
  readonly content: string | readonly ContentPart[];
}

type ContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

export interface ProviderRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly maxOutputTokens: number;
  readonly signal: AbortSignal;
}

export interface ProviderReply {
  readonly text: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  /** "openrouter" for a real provider call, "mock" when the broker runs without provider calls. */
  readonly source: "openrouter" | "mock";
}

export interface ChatProvider {
  complete(request: ProviderRequest): Promise<ProviderReply>;
}

export class ProviderFailure extends Error {
  constructor(
    readonly reason: "UNAVAILABLE" | "RATE_LIMITED" | "REJECTED",
    readonly retryable: boolean,
    readonly status: number | undefined,
  ) {
    super(`provider ${reason.toLowerCase()}`);
    this.name = "ProviderFailure";
  }
}

export class ProviderTimeoutError extends Error {
  constructor() {
    super("provider attempt timed out");
    this.name = "ProviderTimeoutError";
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Calls OpenRouter's chat completions endpoint with zero-retention routing on every request. */
export class OpenRouterProvider implements ChatProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxOutputTokens,
          stream: false,
          // Route only to endpoints with zero data retention, and never to endpoints that may train on data.
          provider: { zdr: true, data_collection: "deny" },
        }),
        signal: request.signal,
        // A redirect would send the key to another host. Refuse it.
        redirect: "error",
      });
    } catch {
      if (request.signal.aborted) {
        throw new ProviderTimeoutError();
      }
      throw new ProviderFailure("UNAVAILABLE", true, undefined);
    }

    if (!response.ok) {
      // The error body is never read: it could contain prompt text or the key echoed back.
      await response.body?.cancel();
    }
    if (response.status === 429) {
      throw new ProviderFailure("RATE_LIMITED", true, 429);
    }
    if (response.status >= 500) {
      throw new ProviderFailure("UNAVAILABLE", true, response.status);
    }
    if (!response.ok) {
      throw new ProviderFailure("REJECTED", false, response.status);
    }
    return parseCompletion(await readBounded(response));
  }
}

/**
 * Deterministic provider for mock mode and tests. It makes no network call and holds no key. Its usage is
 * computed from the request size, so reservation and settlement still run end to end.
 */
export class MockProvider implements ChatProvider {
  constructor(private readonly script: readonly ("ok" | "unavailable" | "hang")[] = ["ok"]) {}

  private attempts = 0;

  get attemptCount(): number {
    return this.attempts;
  }

  complete(request: ProviderRequest): Promise<ProviderReply> {
    const action = this.script[Math.min(this.attempts, this.script.length - 1)] ?? "ok";
    this.attempts += 1;
    if (action === "unavailable") {
      return Promise.reject(new ProviderFailure("UNAVAILABLE", true, 503));
    }
    if (action === "hang") {
      return new Promise((_resolve, reject) => {
        const timeout = () => {
          reject(new ProviderTimeoutError());
        };
        if (request.signal.aborted) {
          timeout();
          return;
        }
        request.signal.addEventListener("abort", timeout, { once: true });
      });
    }
    const promptBytes = JSON.stringify(request.messages).length;
    return Promise.resolve({
      text: "mock reply: the broker is running without provider calls",
      promptTokens: Math.ceil(promptBytes / 8),
      completionTokens: Math.min(request.maxOutputTokens, 16),
      source: "mock",
    });
  }
}

function parseCompletion(body: unknown): ProviderReply {
  const data = body as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const text = data.choices?.[0]?.message?.content;
  const promptTokens = data.usage?.prompt_tokens;
  const completionTokens = data.usage?.completion_tokens;
  if (
    typeof text !== "string" ||
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(completionTokens) ||
    (promptTokens as number) < 0 ||
    (completionTokens as number) < 0
  ) {
    throw new ProviderFailure("REJECTED", false, undefined);
  }
  return {
    text,
    promptTokens: promptTokens as number,
    completionTokens: completionTokens as number,
    source: "openrouter",
  };
}

/** A success body larger than this is refused, so a misbehaving upstream cannot exhaust broker memory. */
const MAX_PROVIDER_BODY_BYTES = 262_144;

async function readBounded(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_PROVIDER_BODY_BYTES) {
    await response.body?.cancel();
    throw new ProviderFailure("REJECTED", false, response.status);
  }
  if (response.body === null) {
    throw new ProviderFailure("REJECTED", false, response.status);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_PROVIDER_BODY_BYTES) {
      await reader.cancel();
      throw new ProviderFailure("REJECTED", false, response.status);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ProviderFailure("REJECTED", false, response.status);
  }
}
