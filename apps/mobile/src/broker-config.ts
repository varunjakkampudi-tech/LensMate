/**
 * The broker address comes only from validated configuration (EXPO_PUBLIC_BROKER_BASE_URL). The app never assumes a
 * hostname. Plain HTTP is accepted only for a loopback address, for local development against a broker on this machine.
 */
export type BrokerConfig =
  | { readonly ok: true; readonly baseUrl: string }
  | { readonly ok: false; readonly reason: "NOT_CONFIGURED" | "INVALID" | "INSECURE" };

const PATH_PREFIX = /^(\/[a-z0-9-]+)+$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function parseBrokerBaseUrl(raw: string | undefined): BrokerConfig {
  const value = raw?.trim() ?? "";
  if (value === "") {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return { ok: false, reason: "INVALID" };
  }
  // A path prefix is allowed for a broker behind a reverse proxy (for example /api/broker). It may not reach a route.
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "" && (!PATH_PREFIX.test(path) || /^\/v\d/.test(path))) {
    return { ok: false, reason: "INVALID" };
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    return { ok: false, reason: "INSECURE" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "INVALID" };
  }
  return { ok: true, baseUrl: `${url.origin}${path}` };
}

export function readBrokerConfig(): BrokerConfig {
  return parseBrokerBaseUrl(process.env.EXPO_PUBLIC_BROKER_BASE_URL);
}
