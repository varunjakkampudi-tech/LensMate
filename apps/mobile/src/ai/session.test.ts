import { SESSION_SILENCE_MS, startsNewSession } from "./session";

describe("startsNewSession", () => {
  it("starts a session on the first request", () => {
    expect(startsNewSession(null, 1_000)).toBe(true);
  });

  it("continues a session at exactly the silence limit, and ends it just after", () => {
    expect(startsNewSession(0, SESSION_SILENCE_MS)).toBe(false);
    expect(startsNewSession(0, SESSION_SILENCE_MS + 1)).toBe(true);
  });
});
