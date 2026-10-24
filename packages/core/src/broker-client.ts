import type { ClassifiedProviderError, GatewayErrorCode } from "./provider-gateway.js";
import type { ProviderRun } from "./provider-gateway.js";

/**
 * App-side client for the server-side provider broker (Engineering Standards 4; Goal 10A.3).
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
  const parsed = JSON.parse(text) as Partial<BrokerUsage>;
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

/** Adapts a broker call to the gateway's ProviderRun. The cost is reported in paise, the gateway's unit. */
export function brokerProviderRun(
  options: BrokerClientOptions,
  body: BrokerChatRequest,
): ProviderRun<BrokerReply> {
  return async (signal) => {
    const reply = await requestBrokerChat(options, body, signal);
    return { value: reply, costMinor: reply.costPaise };
  };
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
