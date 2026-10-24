/**
 * The AI connection panel's logic. Each line is reported separately, and anything that was not checked says so.
 * Nothing here sends a credential, calls an AI provider, or spends money.
 *
 * Reachability uses a request with no credentials to a protected route. A 401 or 403 proves the broker answers over
 * HTTPS; it does not prove that any AI provider works. OpenRouter is reported as "not checked": the phone never talks to
 * it, and the broker's provider state is not visible from here.
 */
export type Tri = "yes" | "no" | "not checked";

type ProviderMode = "mock" | "live" | "unknown";

export interface AiConnectionInput {
  readonly endpointConfigured: boolean;
  readonly enrolled: boolean;
  readonly disclosureAccepted: boolean;
  /** From a reachability check run in this session, or "not checked" if none ran. */
  readonly reachable: Tri;
  /** The provider mode of the most recent answer, if any. */
  readonly lastAnswerSource: "mock" | "openrouter" | null;
  readonly lastRequest: {
    readonly ok: boolean;
    readonly route: string;
    readonly latencyMs: number;
  } | null;
  readonly lastError: string | null;
  readonly spentPaise: number | null;
  readonly capPaise: number | null;
}

export interface ConnectionRow {
  readonly id:
    | "endpoint"
    | "reachable"
    | "enrolled"
    | "disclosure"
    | "provider"
    | "openrouter"
    | "last"
    | "spend";
  readonly label: string;
  readonly value: string;
  readonly tone: "ok" | "warn" | "muted" | "error";
}

const yesNo = (v: boolean): string => (v ? "Yes" : "No");

export function describeAiConnection(input: AiConnectionInput): ConnectionRow[] {
  const provider: ProviderMode =
    input.lastAnswerSource === "mock"
      ? "mock"
      : input.lastAnswerSource === "openrouter"
        ? "live"
        : "unknown";
  const rows: ConnectionRow[] = [
    {
      id: "endpoint",
      label: "Broker address set",
      value: yesNo(input.endpointConfigured),
      tone: input.endpointConfigured ? "ok" : "error",
    },
    {
      id: "reachable",
      label: "Broker reachable",
      value: input.reachable === "not checked" ? "Not checked" : yesNo(input.reachable === "yes"),
      tone: input.reachable === "yes" ? "ok" : input.reachable === "no" ? "error" : "muted",
    },
    {
      id: "enrolled",
      label: "This phone enrolled",
      value: yesNo(input.enrolled),
      tone: input.enrolled ? "ok" : "warn",
    },
    {
      id: "disclosure",
      label: "Cloud notice accepted",
      value: yesNo(input.disclosureAccepted),
      tone: input.disclosureAccepted ? "ok" : "warn",
    },
    {
      id: "provider",
      label: "Answer mode",
      value:
        provider === "mock"
          ? "Mock (no provider called)"
          : provider === "live"
            ? "Live provider"
            : "Unknown",
      tone: provider === "live" ? "ok" : "muted",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      value: "Not checked from the phone",
      tone: "muted",
    },
  ];
  if (input.lastRequest === null) {
    rows.push({ id: "last", label: "Last request", value: "None yet", tone: "muted" });
  } else if (input.lastRequest.ok) {
    rows.push({
      id: "last",
      label: "Last request",
      value: `Answered · ${input.lastRequest.route} · ${(input.lastRequest.latencyMs / 1000).toFixed(1)} s`,
      tone: "ok",
    });
  } else {
    rows.push({
      id: "last",
      label: "Last request",
      value: input.lastError ?? "Failed",
      tone: "error",
    });
  }
  rows.push({
    id: "spend",
    label: "Spending this month",
    value:
      input.spentPaise === null || input.capPaise === null
        ? "Not available until enrolled and the notice is accepted"
        : `₹${(input.spentPaise / 100).toFixed(2)} of ₹${(input.capPaise / 100).toFixed(2)} cap`,
    tone: "muted",
  });
  return rows;
}

/**
 * Checks that the broker answers at baseUrl. Sends no credential and calls no AI route. Resolves to "yes" for any HTTP
 * answer from a protected route (401 or 403), "no" for a network failure or an unexpected answer.
 */
export async function checkBrokerReachable(
  baseUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<"yes" | "no"> {
  try {
    const response = await fetchImpl(`${baseUrl}/v1/usage`, {
      method: "GET",
      signal,
      cache: "no-store",
    });
    return response.status === 401 || response.status === 403 ? "yes" : "no";
  } catch {
    return "no";
  }
}
