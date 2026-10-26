/** A translation or caption session ends after this much time without a request. */
export const SESSION_SILENCE_MS = 120_000;

/** True when a new session starts: no earlier request, or the last one was more than the silence limit ago. */
export function startsNewSession(lastRequestMs: number | null, nowMs: number): boolean {
  return lastRequestMs === null || nowMs - lastRequestMs > SESSION_SILENCE_MS;
}
