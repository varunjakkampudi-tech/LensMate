/** A session ends after this much time without a request (v9 section 21: translation and caption, 2 minutes). */
export const SESSION_SILENCE_MS = 120_000;

/** True when a new session starts: no earlier request, or the last one was more than the silence limit ago. */
export function startsNewSession(lastRequestMs: number | null, nowMs: number): boolean {
  return lastRequestMs === null || nowMs - lastRequestMs > SESSION_SILENCE_MS;
}
