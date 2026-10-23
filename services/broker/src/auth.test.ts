import { hashClientSecret } from "./config.js";
import { authenticate } from "./server.js";

const CLIENTS = [
  { id: "app-1", secretSha256: hashClientSecret("correct-secret-0123456789abcdefghijklmnop") },
  { id: "app-2", secretSha256: hashClientSecret("other-secret-0123456789abcdefghijklmnop") },
];

describe("authenticate", () => {
  it("returns the client id for the matching id and secret", () => {
    expect(authenticate("Bearer app-1.correct-secret-0123456789abcdefghijklmnop", CLIENTS)).toBe(
      "app-1",
    );
  });

  it("refuses a wrong secret for a known client", () => {
    expect(authenticate("Bearer app-1.wrong-secret-0123456789", CLIENTS)).toBeNull();
  });

  it("refuses a secret that belongs to another client", () => {
    expect(
      authenticate("Bearer app-1.other-secret-0123456789abcdefghijklmnop", CLIENTS),
    ).toBeNull();
  });

  it("refuses an unknown client id", () => {
    expect(
      authenticate("Bearer app-9.correct-secret-0123456789abcdefghijklmnop", CLIENTS),
    ).toBeNull();
  });

  it("refuses a missing, malformed or non-bearer header", () => {
    expect(authenticate(undefined, CLIENTS)).toBeNull();
    expect(authenticate("", CLIENTS)).toBeNull();
    expect(
      authenticate("Basic app-1.correct-secret-0123456789abcdefghijklmnop", CLIENTS),
    ).toBeNull();
    expect(authenticate("Bearer app-1", CLIENTS)).toBeNull();
    expect(authenticate("Bearer app-1.short", CLIENTS)).toBeNull();
    expect(
      authenticate("Bearer app 1.correct-secret-0123456789abcdefghijklmnop", CLIENTS),
    ).toBeNull();
  });

  it("refuses everything when no clients are configured", () => {
    expect(authenticate("Bearer app-1.correct-secret-0123456789abcdefghijklmnop", [])).toBeNull();
  });
});
