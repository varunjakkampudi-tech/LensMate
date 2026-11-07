import { createHmac } from "node:crypto";
import { AccountBinding, AccountError } from "./account-binding.js";
import type { AccountAuthorizer, AccountOptions } from "./account-binding.js";

const T0 = 1_000_000;
const DEVICE = "glasses-1";
const ACCOUNT = "acct-owner";
const CHALLENGE = "ABCDEF123456";
const KEY = "platform-held-test-key";
const OWNER = { token: "owner-proof" };

/** Test commitment: keyed HMAC, as the platform would supply. */
const commit = (challenge: string, deviceId: string, accountId: string): string =>
  createHmac("sha256", KEY).update(`${deviceId}|${accountId}|${challenge}`).digest("hex");

/** Authorizer: accepts only the owner proof, for any action. */
const ownerOnly: AccountAuthorizer = (_action, _account, authorization) =>
  Promise.resolve(
    typeof authorization === "object" &&
      authorization !== null &&
      (authorization as { token?: unknown }).token === OWNER.token,
  );

function options(extra: Partial<AccountOptions> = {}): AccountOptions {
  return { deviceId: DEVICE, authorize: ownerOnly, commit, ...extra };
}

function issue(b: AccountBinding, challenge: unknown, at: number, accountId = ACCOUNT) {
  return b.issueChallenge({ accountId, challenge, authorization: OWNER }, at);
}

function bind(
  b: AccountBinding,
  challenge: unknown,
  at: number,
  accountId = ACCOUNT,
  confirmed: unknown = true,
) {
  return b.bind({ accountId, challenge, confirmed, authorization: OWNER }, at);
}

async function bindDevice(b: AccountBinding, at = T0): Promise<void> {
  expect(await issue(b, CHALLENGE, at)).toEqual({ status: "OK" });
  expect(await bind(b, CHALLENGE, at + 1)).toEqual({ status: "OK" });
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("AccountBinding", () => {
  it("standalone operation needs no account", () => {
    const b = AccountBinding.fresh(options());
    expect(b.standaloneAllowed()).toBe(true);
    expect(b.status()).toBe("UNBOUND");
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
  });

  it("issuing a challenge needs authorization; the snapshot holds only a commitment; the challenge expires", async () => {
    const b = AccountBinding.fresh(options({ challengeTtlMs: 60_000 }));
    expect(
      await b.issueChallenge(
        { accountId: ACCOUNT, challenge: CHALLENGE, authorization: "nope" },
        T0,
      ),
    ).toEqual({
      status: "REFUSED",
      reason: "NOT_AUTHORIZED",
    });
    expect(b.snapshot().challenge).toBeNull();
    await issue(b, CHALLENGE, T0);
    const serialized = JSON.stringify(b.snapshot());
    expect(serialized).not.toContain(CHALLENGE);
    expect(b.snapshot().challenge?.commitment).toBe(commit(CHALLENGE, DEVICE, ACCOUNT));
    expect(await bind(b, CHALLENGE, T0 + 60_001)).toEqual({ status: "REFUSED", reason: "EXPIRED" });
  });

  it("a challenge is single-use: a replay is refused with REPLAY", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 5);
    expect(await issue(b, CHALLENGE, T0 + 10)).toEqual({ status: "OK" });
    expect(await bind(b, CHALLENGE, T0 + 11)).toEqual({ status: "REFUSED", reason: "REPLAY" });
    expect(b.status()).toBe("REVOKED");
  });

  it("binding needs exact confirmation and the right challenge; wrong values count toward a lockout", async () => {
    const b = AccountBinding.fresh(options({ maxAttempts: 2 }));
    await issue(b, CHALLENGE, T0);
    expect(await bind(b, CHALLENGE, T0 + 1, ACCOUNT, false)).toEqual({
      status: "REFUSED",
      reason: "NOT_CONFIRMED",
    });
    expect(await bind(b, "WRONGWRONG12", T0 + 2)).toEqual({
      status: "REFUSED",
      reason: "WRONG_CHALLENGE",
    });
    expect(await bind(b, "WRONGWRONG34", T0 + 3)).toEqual({
      status: "REFUSED",
      reason: "WRONG_CHALLENGE",
    });
    expect(await bind(b, CHALLENGE, T0 + 4)).toEqual({ status: "REFUSED", reason: "LOCKED" });
    expect(b.status()).toBe("UNBOUND");
  });

  it("a bound device cannot be bound to a different account; ownership transfer is refused", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    expect(await issue(b, "ZZZZZZZZZZZZ", T0 + 10, "acct-other")).toEqual({
      status: "REFUSED",
      reason: "ALREADY_BOUND",
    });
    expect(b.canUseAccount(ACCOUNT)).toBe(true);
    expect(b.canUseAccount("acct-other")).toBe(false);
  });

  it("revocation is immediate; re-enrolment needs owner approval and a new challenge", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    expect(await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 5)).toEqual({
      status: "OK",
    });
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
    expect(await issue(b, "NEWCHALLENGE1", T0 + 6)).toEqual({ status: "OK" });
    const unapproved = AccountBinding.fresh(options());
    await bindDevice(unapproved);
    await unapproved.revoke({ confirmed: true, authorization: OWNER }, T0 + 5);
    expect(
      await unapproved.issueChallenge(
        { accountId: ACCOUNT, challenge: "NEWCHALLENGE1", authorization: "CHALLENGE-ONLY" },
        T0 + 6,
      ),
    ).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
  });

  it("the account capability check denies by default", async () => {
    const b = AccountBinding.fresh(options());
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
    await bindDevice(b);
    expect(b.canUseAccount(ACCOUNT)).toBe(true);
    expect(b.canUseAccount("acct-other")).toBe(false);
  });

  it("restart keeps the binding; corrupt saved state binds nothing", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    const restored = AccountBinding.restore(json(b.snapshot()), options());
    expect(restored.canUseAccount(ACCOUNT)).toBe(true);

    const bad: unknown[] = [
      null,
      "x",
      { deviceId: "other-device", binding: null, challenge: null, usedChallenges: [], audit: [] },
      {
        deviceId: DEVICE,
        binding: { accountId: ACCOUNT, status: "BOUND", boundAtMs: 1 },
        challenge: null,
        usedChallenges: [1],
        audit: [],
      },
      {
        deviceId: DEVICE,
        binding: { accountId: "", status: "BOUND", boundAtMs: 1 },
        challenge: null,
        usedChallenges: [],
        audit: [],
      },
      {
        deviceId: DEVICE,
        binding: null,
        challenge: null,
        usedChallenges: [],
        audit: [{ action: "FORGED", accountId: "a", atMs: 1 }],
      },
    ];
    for (const saved of bad) {
      const corrupt = AccountBinding.restore(saved, options());
      expect(corrupt.status()).toBe("UNBOUND");
      expect(corrupt.canUseAccount(ACCOUNT)).toBe(false);
    }
  });

  it("invalid and out-of-order times are refused; a confirmation before issuance is BEFORE_ISSUE", async () => {
    const b = AccountBinding.fresh(options());
    await issue(b, CHALLENGE, T0);
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(await bind(b, CHALLENGE, at)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(await bind(b, CHALLENGE, T0 - 1)).toEqual({ status: "REFUSED", reason: "BEFORE_ISSUE" });
    expect(b.status()).toBe("UNBOUND");
  });

  it("audit records applied changes only; no plaintext challenge appears in state or audit", async () => {
    const b = AccountBinding.fresh(options());
    await issue(b, CHALLENGE, T0);
    await bind(b, CHALLENGE, T0 + 1, ACCOUNT, false);
    await bind(b, CHALLENGE, T0 + 2);
    expect(b.snapshot().audit.map((a) => a.action)).toEqual(["CHALLENGE_ISSUED", "BOUND"]);
    expect(JSON.stringify(b.snapshot())).not.toContain(CHALLENGE);
  });

  it("concurrent binds of the same challenge succeed at most once", async () => {
    const b = AccountBinding.fresh(options());
    await issue(b, CHALLENGE, T0);
    const results = await Promise.all([bind(b, CHALLENGE, T0 + 1), bind(b, CHALLENGE, T0 + 1)]);
    const oks = results.filter((r) => r.status === "OK");
    expect(oks).toHaveLength(1);
    expect(b.status()).toBe("BOUND");
  });

  it("rejects invalid configuration with INVALID_CONFIG", () => {
    expect(() => AccountBinding.fresh(options({ challengeTtlMs: 0 }))).toThrow(AccountError);
    expect(() => AccountBinding.fresh(options({ challengeTtlMs: 16 * 60 * 1000 }))).toThrow(
      AccountError,
    );
    expect(() => AccountBinding.fresh(options({ maxAttempts: 0 }))).toThrow(AccountError);
    expect(() => AccountBinding.fresh(options({ maxUsedChallenges: 0 }))).toThrow(AccountError);
    expect(() => AccountBinding.fresh({ deviceId: "", authorize: ownerOnly, commit })).toThrow(
      AccountError,
    );
  });
});
