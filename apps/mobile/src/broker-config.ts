import { Platform } from "react-native";

/**
 * The broker address comes only from validated configuration (EXPO_PUBLIC_BROKER_BASE_URL). The app never assumes a
 * hostname. Plain HTTP is accepted only for a loopback address, and only in a browser on the same machine.
 *
 * On a phone, a loopback address points at the phone itself, so it can never reach the broker on the PC. That case
 * is reported separately (LOOPBACK_ON_DEVICE), so the app can say what is wrong instead of "not set".
 */
type BrokerConfigReason = "NOT_CONFIGURED" | "INVALID" | "INSECURE" | "LOOPBACK_ON_DEVICE";

export type BrokerConfig =
  | { readonly ok: true; readonly baseUrl: string }
  | { readonly ok: false; readonly reason: BrokerConfigReason };

const PATH_PREFIX = /^(\/[a-z0-9-]+)+$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function parseBrokerBaseUrl(raw: string | undefined, onDevice = false): BrokerConfig {
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
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "INVALID" };
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol === "http:" && !loopback) {
    return { ok: false, reason: "INSECURE" };
  }
  if (loopback && onDevice) {
    return { ok: false, reason: "LOOPBACK_ON_DEVICE" };
  }
  return { ok: true, baseUrl: `${url.origin}${path}` };
}

/** Reads the address for this platform. A phone cannot use a loopback address, so it is checked as on-device. */
export function readBrokerConfig(): BrokerConfig {
  return parseBrokerBaseUrl(process.env.EXPO_PUBLIC_BROKER_BASE_URL, Platform.OS !== "web");
}

/** One plain sentence for the home and assistant screens. It names the cause and what the app does instead. */
export function brokerStatusText(config: BrokerConfig): string {
  if (config.ok) {
    return "AI service address is set. Answers use the service once this phone is enrolled.";
  }
  switch (config.reason) {
    case "NOT_CONFIGURED":
      return "No AI service address is set in this build, so answers are mock responses.";
    case "LOOPBACK_ON_DEVICE":
      return "This build's AI address points at this PC, which the phone cannot reach. Answers are mock responses until a secure address is set.";
    case "INSECURE":
      return "The AI service address must use HTTPS. Answers are mock responses until it does.";
    case "INVALID":
      return "The AI service address in this build is not valid. Answers are mock responses.";
  }
}
