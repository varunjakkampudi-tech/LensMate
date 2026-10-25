/**
 * Log hygiene (v9 section 8; Engineering Standards 4 and 5; Global standard 11).
 *
 * Logs carry only an allowlist of fields. Any other field is dropped, not redacted, so new fields
 * cannot leak by accident. Values that still look like secrets or personal data are replaced.
 */
export const ALLOWED_LOG_FIELDS: readonly string[] = [
  "timestamp",
  "level",
  "service",
  "release",
  "event",
  "requestId",
  "feature",
  "durationMs",
  "errorCode",
];

export const REDACTED = "[REDACTED]";

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bBasic\s+[A-Za-z0-9+/]{8,}=*/gi,
  /\b(?:api[_-]?key|access[_-]?token|token|secret|password|passwd|otp|authorization)\s*[=:]\s*[^\r\n]+/gi,
  /data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  /\+?\d[\d\s-]{8,}\d/g,
];

export type LogValue = string | number | boolean | null;

export interface LogEntry {
  readonly [field: string]: LogValue | undefined;
}

/** Keeps allowlisted fields only, and removes secret-like or personal text from their values. */
export function toSafeLogEntry(entry: Readonly<Record<string, unknown>>): LogEntry {
  const safe: Record<string, LogValue> = {};
  for (const field of ALLOWED_LOG_FIELDS) {
    const value = entry[field];
    if (typeof value === "string") {
      safe[field] = redactText(value);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[field] = value;
    }
  }
  return safe;
}

/** Replaces secret-like and personal-looking text. Exposed for tests and for the error path. */
export function redactText(text: string): string {
  let result = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}
