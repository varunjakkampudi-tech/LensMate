import { Writable } from "node:stream";
import { toSafeLogEntry, type LogEntry } from "@lensmate/core";

const LEVEL_NAMES: Readonly<Record<number, string>> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

/**
 * Turns one Pino JSON line into an allowlisted entry. Request bodies, headers, URLs and error messages are never
 * copied; only the fields in `ALLOWED_LOG_FIELDS` survive, and their text is redacted.
 */
export function toBrokerLogEntry(line: string): LogEntry {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { level: "error", event: "unparseable_log_line" };
  }
  const err = raw.err as { code?: unknown } | undefined;
  return toSafeLogEntry({
    // Epoch milliseconds are numbers, so the allowlist keeps them as they are. A date string would match the phone
    // number pattern in redactText and be replaced.
    timestamp: typeof raw.time === "number" ? raw.time : undefined,
    level: typeof raw.level === "number" ? (LEVEL_NAMES[raw.level] ?? "info") : "info",
    service: "broker",
    event: typeof raw.msg === "string" ? raw.msg : undefined,
    requestId: typeof raw.reqId === "string" ? raw.reqId : undefined,
    durationMs: typeof raw.responseTime === "number" ? Math.round(raw.responseTime) : undefined,
    errorCode: typeof err?.code === "string" ? err.code : undefined,
  });
}

/**
 * A writable stream for Fastify's logger. It splits the input into lines, converts each line with
 * `toBrokerLogEntry`, and writes one safe JSON line per entry to `target`.
 */
export function createSafeLogStream(target: { write(chunk: string): unknown }): Writable {
  let pending = "";
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      pending += chunk.toString();
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line !== "") target.write(`${JSON.stringify(toBrokerLogEntry(line))}\n`);
        newline = pending.indexOf("\n");
      }
      callback();
    },
  });
}
