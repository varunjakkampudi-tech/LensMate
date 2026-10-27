import type { ClassifiedProviderError, GatewayErrorCode } from "./provider-gateway.js";

/**
 * App-side client for the server-side provider broker.
 *
 * The app holds no provider key. It holds only the broker address and its own client token, which is supplied
 * by the caller from secure device storage. The client never logs the token, a prompt, or a reply.
 * Failures are mapped to the gateway's codes, so the gateway can stop at once when retrying cannot help.
 */
export interface BrokerClientOptions {
  readonly baseUrl: string;
  /** The app's bearer token, `<clientId>.<secret>`. Supplied from secure storage, never from the bundle. */
  readonly token: string;
  readonly fetch?: typeof fetch;
}

export type BrokerChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

export interface BrokerChatRequest {
  readonly model: string;
  readonly messages: readonly BrokerChatMessage[];
  readonly maxOutputTokens: number;
}

export interface BrokerReply {
  readonly requestId: string;
  readonly text: string;
  readonly costPaise: number;
  /** "mock" when the broker runs without provider calls. Show it to the user as a mock, never as AI output. */
  readonly source: "openrouter" | "mock";
}

/** A broker failure. `gatewayCode` and `retryable` tell the gateway how to treat it (see provider-gateway.ts). */
export class BrokerError extends Error implements ClassifiedProviderError {
  constructor(
    readonly code: string,
    readonly gatewayCode: GatewayErrorCode,
    readonly retryable: boolean,
  ) {
    super(`broker refused the request: ${code}`);
    this.name = "BrokerError";
  }
}

/** A reply longer than this is refused, so a misbehaving server cannot exhaust the app's memory. */
const MAX_REPLY_CHARS = 1_000_000;

/** Calls the broker's text route. The signal is the gateway's timeout, so a stalled call is cancelled. */
export function requestBrokerChat(
  options: BrokerClientOptions,
  body: BrokerChatRequest,
  signal: AbortSignal,
): Promise<BrokerReply> {
  return postForReply(options, "/v1/ai/text", body, signal);
}

export interface BrokerVisionRequest {
  readonly model: string;
  readonly prompt: string;
  /** A JPEG or PNG data URL taken inside a user-started capture session. */
  readonly imageDataUrl: string;
  readonly maxOutputTokens: number;
}

/** Calls the broker's vision route with one user-captured image. */
export function requestBrokerVision(
  options: BrokerClientOptions,
  body: BrokerVisionRequest,
  signal: AbortSignal,
): Promise<BrokerReply> {
  return postForReply(options, "/v1/ai/vision", body, signal);
}

export interface BrokerUsage {
  readonly month: string;
  readonly capPaise: number;
  readonly spentPaise: number;
  readonly reservedPaise: number;
  readonly remainingPaise: number;
  readonly source: "openrouter" | "mock";
}

/** Reads this month's server-side spend. The app only mirrors it; the broker enforces the cap. */
export async function requestBrokerUsage(
  options: BrokerClientOptions,
  signal: AbortSignal,
): Promise<BrokerUsage> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${trimSlash(options.baseUrl)}/v1/usage`, {
      headers: { Authorization: `Bearer ${options.token}` },
      signal,
    });
  } catch {
    throw new BrokerError("NETWORK", "PROVIDER_ERROR", true);
  }
  const text = await response.text();
  if (!response.ok) {
    throw refusalFor(response.status, text);
  }
  let parsed: Partial<BrokerUsage>;
  try {
    parsed = JSON.parse(text) as Partial<BrokerUsage>;
  } catch {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  if (typeof parsed.capPaise !== "number" || typeof parsed.spentPaise !== "number") {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  return parsed as BrokerUsage;
}

async function postForReply(
  options: BrokerClientOptions,
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<BrokerReply> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${trimSlash(options.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new BrokerError("NETWORK", "PROVIDER_ERROR", true);
  }

  const text = await response.text();
  if (text.length > MAX_REPLY_CHARS) {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  if (response.ok) {
    return parseReply(text);
  }
  throw refusalFor(response.status, text);
}

function refusalFor(status: number, text: string): BrokerError {
  const code = errorCodeOf(text);
  if (status === 401) {
    return new BrokerError("UNAUTHORIZED", "UNAUTHORIZED", false);
  }
  if (code === "TIMEOUT") {
    return new BrokerError(code, "TIMEOUT", false);
  }
  if (code === "BUDGET_EXHAUSTED") {
    return new BrokerError(code, "CAP_REACHED", false);
  }
  if (code === "QUOTA_EXCEEDED") {
    return new BrokerError(code, "QUOTA_EXCEEDED", false);
  }
  if (code === "RATE_LIMITED" || code === "BUSY") {
    return new BrokerError(code, "PROVIDER_ERROR", false);
  }
  if (status >= 500 || code === "PROVIDER_UNAVAILABLE" || code === "TIMEOUT") {
    return new BrokerError(code ?? "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", true);
  }
  return new BrokerError(code ?? "REFUSED", "PROVIDER_ERROR", false);
}

function errorCodeOf(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}

function parseReply(text: string): BrokerReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  const reply = parsed as Partial<BrokerReply>;
  if (
    typeof reply.requestId !== "string" ||
    typeof reply.text !== "string" ||
    typeof reply.costPaise !== "number" ||
    !Number.isSafeInteger(reply.costPaise) ||
    reply.costPaise < 0 ||
    (reply.source !== "openrouter" && reply.source !== "mock")
  ) {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  return {
    requestId: reply.requestId,
    text: reply.text,
    costPaise: reply.costPaise,
    source: reply.source,
  };
}

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export interface EnrolledDevice {
  readonly deviceId: string;
  /** The device's own secret. The app must store it in secure device storage and never log it. */
  readonly deviceSecret: string;
}

/**
 * Exchanges an owner-issued, single-use enrolment code for this device's own credential. The code is typed by the
 * owner. The returned secret belongs to this device only, and the broker can revoke it on its own.
 */
export async function enrolDevice(
  baseUrl: string,
  code: string,
  label: string,
  doFetch: typeof fetch = fetch,
): Promise<EnrolledDevice> {
  let response: Response;
  try {
    response = await doFetch(`${trimSlash(baseUrl)}/v1/enrol`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, label }),
      redirect: "error",
    });
  } catch {
    throw new BrokerError("NETWORK", "PROVIDER_ERROR", true);
  }
  const text = await response.text();
  if (!response.ok) {
    throw refusalFor(response.status, text);
  }
  let parsed: Partial<EnrolledDevice>;
  try {
    parsed = JSON.parse(text) as Partial<EnrolledDevice>;
  } catch {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  if (typeof parsed.deviceId !== "string" || typeof parsed.deviceSecret !== "string") {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  return { deviceId: parsed.deviceId, deviceSecret: parsed.deviceSecret };
}

/** One server-sent event: its name, and its data lines joined. */
interface SseEvent {
  readonly event: string;
  readonly data: string;
}

/**
 * Reads server-sent events as they arrive. A runtime whose fetch cannot stream a body gets the whole text once the
 * response ends, and the same events are then processed in order.
 */
async function forEachSseEvent(
  response: Response,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  let buffer = "";
  const emit = (block: string): void => {
    let name = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        name = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice("data:".length).trim());
      }
    }
    if (data.length > 0) {
      onEvent({ event: name, data: data.join("\n") });
    }
  };
  const feed = (text: string): void => {
    buffer += text;
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      emit(block);
      end = buffer.indexOf("\n\n");
    }
  };

  if (!response.body) {
    const whole = await response.text();
    if (whole.length > MAX_REPLY_CHARS) {
      throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
    }
    feed(whole);
    if (buffer.trim() !== "") {
      emit(buffer);
    }
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_REPLY_CHARS) {
      await reader.cancel();
      throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
    }
    try {
      feed(decoder.decode(value, { stream: true }));
    } catch (error) {
      await reader.cancel();
      throw error;
    }
  }
  feed(decoder.decode());
  if (buffer.trim() !== "") {
    emit(buffer);
  }
}

function parseEventData(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Handled below with the same error as any other malformed event.
  }
  throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
}

/** A broker error event ends the stream. Text already shown is not retried, so the error is not retryable. */
function streamFailure(code: unknown): BrokerError {
  if (code === "TIMEOUT") {
    return new BrokerError("TIMEOUT", "TIMEOUT", false);
  }
  return new BrokerError(
    typeof code === "string" ? code : "PROVIDER_UNAVAILABLE",
    "PROVIDER_ERROR",
    false,
  );
}

/**
 * Streams a text answer from the broker. onDelta receives each piece of text as it arrives. The reply resolves when the
 * broker sends its done event, which carries the cost. A failure before the first word is an ordinary refusal; a
 * failure after it arrives as an error event.
 */
export async function streamBrokerChat(
  options: BrokerClientOptions,
  body: BrokerChatRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<BrokerReply> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${trimSlash(options.baseUrl)}/v1/ai/text/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new BrokerError("NETWORK", "PROVIDER_ERROR", true);
  }
  if (!response.ok) {
    throw refusalFor(response.status, await response.text());
  }

  let text = "";
  const result: { done?: { costPaise: number; source: "openrouter" | "mock" } } = {};
  await forEachSseEvent(response, (event) => {
    // Nothing may follow the done event: a second reply would change what was billed.
    if (result.done !== undefined) {
      throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
    }
    const data = parseEventData(event.data);
    if (event.event === "delta") {
      if (typeof data.text !== "string") {
        throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
      }
      text += data.text;
      onDelta(data.text);
      return;
    }
    if (event.event === "done") {
      const costPaise = data.costPaise;
      const source = data.source;
      if (
        !Number.isSafeInteger(costPaise) ||
        (costPaise as number) < 0 ||
        (source !== "openrouter" && source !== "mock")
      ) {
        throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
      }
      result.done = { costPaise: costPaise as number, source };
      return;
    }
    if (event.event === "error") {
      throw streamFailure(data.code);
    }
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  });

  if (result.done === undefined) {
    throw new BrokerError("MALFORMED_REPLY", "PROVIDER_ERROR", false);
  }
  return {
    requestId: "streamed",
    text,
    costPaise: result.done.costPaise,
    source: result.done.source,
  };
}
