import { createHmac } from "node:crypto";
import { AccountBinding, AccountError } from "./account-binding.js";
import type { AccountAuthorizer, AccountOptions } from "./account-binding.js";

const T0 = 1_000_000;
const DEVICE = "glasses-1";
const EPOCH = "epoch-0000000000001";
const NEW_EPOCH = "epoch-0000000000002";
const ACCOUNT = "acct-owner";
const OTHER = "acct-other";
const CHALLENGE = "ABCDEF123456";
const KEY = "platform-held-test-key";
const OWNER = { token: "owner-proof" };
const PREVIOUS_OWNER = { token: "previous-owner-release" };

/** Test commitment: keyed HMAC over the scope (device and epoch) and the account. */
const commit = (challenge: string, scope: string, accountId: string): string =>
  createHmac("sha256", KEY).update(`${scope}|${accountId}|${challenge}`).digest("hex");

const scopeOf = (epoch: string): string => `${DEVICE}#${epoch}`;

/** Authorizer: accepts the owner proof for CHALLENGE, BIND, REVOKE and RECOVER. */
const ownerOnly: AccountAuthorizer = (action, _account, authorization) => {
  if (action === "RECOVER") {
    const proof = (authorization as { proof?: { token?: unknown } } | null)?.proof;
    return Promise.resolve(proof?.token === OWNER.token);
  }
  const token = (authorization as { token?: unknown } | null)?.token;
  return Promise.resolve(token === OWNER.token);
};

/** Re-enrolment: RELEASE needs the previous owner's proof; REENROLL needs the owner's proof. */
const twoApprovals: AccountAuthorizer = (action, account, authorization) => {
  const token = (authorization as { token?: unknown } | null)?.token;
  if (action === "RELEASE") return Promise.resolve(token === PREVIOUS_OWNER.token);
  if (action === "REENROLL") return Promise.resolve(token === OWNER.token);
  return ownerOnly(action, account, authorization);
};

function options(extra: Partial<AccountOptions> = {}): AccountOptions {
  return { deviceId: DEVICE, epoch: EPOCH, authorize: twoApprovals, commit, ...extra };
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

const reenrol = { release: PREVIOUS_OWNER, target: OWNER };
const recoveryAuth = { proof: OWNER, epoch: NEW_EPOCH };

describe("AccountBinding", () => {
  it("standalone operation needs no account", () => {
    const b = AccountBinding.fresh(options());
    expect(b.standaloneAllowed()).toBe(true);
    expect(b.status()).toBe("UNBOUND");
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
  });

  it("issuing a challenge needs authorization; the snapshot holds only a scoped commitment; the challenge expires", async () => {
    const b = AccountBinding.fresh(options({ challengeTtlMs: 60_000 }));
    expect(
      await b.issueChallenge(
        { accountId: ACCOUNT, challenge: CHALLENGE, authorization: "nope" },
        T0,
      ),
    ).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    expect(b.snapshot().challenge).toBeNull();
    await issue(b, CHALLENGE, T0);
    expect(JSON.stringify(b.snapshot())).not.toContain(CHALLENGE);
    expect(b.snapshot().challenge?.commitment).toBe(commit(CHALLENGE, scopeOf(EPOCH), ACCOUNT));
    expect(await bind(b, CHALLENGE, T0 + 60_001)).toEqual({ status: "REFUSED", reason: "EXPIRED" });
  });

  it("a challenge is single-use: a consumed challenge is refused with REPLAY, even after revocation and re-enrolment", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 5);
    expect(
      await b.issueChallenge(
        { accountId: ACCOUNT, challenge: CHALLENGE, authorization: reenrol },
        T0 + 10,
      ),
    ).toEqual({ status: "OK" });
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
    expect(await issue(b, "ZZZZZZZZZZZZ", T0 + 10, OTHER)).toEqual({
      status: "REFUSED",
      reason: "ALREADY_BOUND",
    });
    expect(b.canUseAccount(ACCOUNT)).toBe(true);
    expect(b.canUseAccount(OTHER)).toBe(false);
  });

  it("revocation is immediate; re-enrolment with one approval is refused", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    expect(await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 5)).toEqual({
      status: "OK",
    });
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
    expect(
      await b.issueChallenge(
        { accountId: ACCOUNT, challenge: "NEWCHALLENGE1", authorization: OWNER },
        T0 + 6,
      ),
    ).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
  });

  it("CR-36: re-enrolment to a different account needs the previous owner's release; forged or partial approvals are refused", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 5);
    const transfers: unknown[] = [
      OWNER,
      { release: OWNER, target: OWNER },
      { release: "forged", target: OWNER },
      { target: OWNER },
    ];
    for (const authorization of transfers) {
      expect(
        await b.issueChallenge(
          { accountId: OTHER, challenge: "NEWCHALLENGE1", authorization },
          T0 + 6,
        ),
      ).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    }
    expect(b.snapshot().challenge).toBeNull();
    expect(
      await b.issueChallenge(
        { accountId: OTHER, challenge: "NEWCHALLENGE1", authorization: reenrol },
        T0 + 7,
      ),
    ).toEqual({ status: "OK" });
    expect(await bind(b, "NEWCHALLENGE1", T0 + 8, OTHER)).toEqual({ status: "OK" });
    expect(b.canUseAccount(OTHER)).toBe(true);
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
  });

  it("the account capability check denies by default", async () => {
    const b = AccountBinding.fresh(options());
    expect(b.canUseAccount(ACCOUNT)).toBe(false);
    await bindDevice(b);
    expect(b.canUseAccount(ACCOUNT)).toBe(true);
    expect(b.canUseAccount(OTHER)).toBe(false);
  });

  it("restart keeps the binding", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    const restored = AccountBinding.restore(json(b.snapshot()), options());
    expect(restored.canUseAccount(ACCOUNT)).toBe(true);
  });

  it("CR-35: corrupt saved state enters recovery-required, never a fresh unbound device, and denies account use", async () => {
    const bad: unknown[] = [
      null,
      "x",
      {
        deviceId: "other-device",
        epoch: EPOCH,
        binding: null,
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [],
        audit: [],
      },
      {
        deviceId: DEVICE,
        epoch: EPOCH,
        binding: { accountId: ACCOUNT, status: "BOUND", boundAtMs: 1 },
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [1],
        audit: [],
      },
      {
        deviceId: DEVICE,
        epoch: EPOCH,
        binding: { accountId: "", status: "BOUND", boundAtMs: 1 },
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [],
        audit: [],
      },
      {
        deviceId: DEVICE,
        epoch: EPOCH,
        binding: null,
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [],
        audit: [{ action: "FORGED", accountId: "a", atMs: 1 }],
      },
      {
        deviceId: DEVICE,
        epoch: "short",
        binding: null,
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [],
        audit: [],
      },
    ];
    for (const saved of bad) {
      const corrupt = AccountBinding.restore(saved, options());
      expect(corrupt.status()).toBe("RECOVERY_REQUIRED");
      expect(corrupt.canUseAccount(ACCOUNT)).toBe(false);
      expect(await issue(corrupt, "NEWCHALLENGE1", T0)).toEqual({
        status: "REFUSED",
        reason: "RECOVERY_REQUIRED",
      });
      expect(await bind(corrupt, "NEWCHALLENGE1", T0 + 1)).toEqual({
        status: "REFUSED",
        reason: "RECOVERY_REQUIRED",
      });
    }
  });

  it("CR-35: a corrupt bound device cannot be re-enrolled to another account until trusted recovery", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    const tampered = { ...(json(b.snapshot()) as Record<string, unknown>), usedChallenges: [1] };
    const corrupt = AccountBinding.restore(tampered, options());
    expect(corrupt.status()).toBe("RECOVERY_REQUIRED");
    expect(
      await corrupt.issueChallenge(
        { accountId: OTHER, challenge: "NEWCHALLENGE1", authorization: reenrol },
        T0 + 5,
      ),
    ).toEqual({ status: "REFUSED", reason: "RECOVERY_REQUIRED" });
    expect(await corrupt.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 6)).toEqual(
      { status: "OK" },
    );
    expect(corrupt.status()).toBe("UNBOUND");
    expect(corrupt.canUseAccount(ACCOUNT)).toBe(false);
  });

  it("CR-35: recovery needs exact confirmation, device-identity proof, and a new epoch", async () => {
    const corrupt = AccountBinding.restore("garbage", options());
    expect(await corrupt.recover({ confirmed: false, authorization: recoveryAuth }, T0)).toEqual({
      status: "REFUSED",
      reason: "NOT_CONFIRMED",
    });
    expect(
      await corrupt.recover(
        { confirmed: true, authorization: { proof: "nope", epoch: NEW_EPOCH } },
        T0,
      ),
    ).toEqual({
      status: "REFUSED",
      reason: "NOT_AUTHORIZED",
    });
    expect(
      await corrupt.recover(
        { confirmed: true, authorization: { proof: OWNER, epoch: "short" } },
        T0,
      ),
    ).toEqual({
      status: "REFUSED",
      reason: "NOT_AUTHORIZED",
    });
    expect(corrupt.status()).toBe("RECOVERY_REQUIRED");
    expect(await corrupt.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 1)).toEqual(
      { status: "OK" },
    );
    expect(await corrupt.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 2)).toEqual(
      {
        status: "REFUSED",
        reason: "NOT_RECOVERY_REQUIRED",
      },
    );
  });

  it("CR-38: a recovery-required state carrying a binding is inconsistent; recovery cannot reactivate it", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    const inconsistent = {
      ...(json(b.snapshot()) as Record<string, unknown>),
      recoveryRequired: true,
    };
    const restored = AccountBinding.restore(inconsistent, options());
    expect(restored.status()).toBe("RECOVERY_REQUIRED");
    expect(restored.snapshot().binding).toBeNull();
    expect(
      await restored.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 5),
    ).toEqual({ status: "OK" });
    expect(restored.canUseAccount(ACCOUNT)).toBe(false);
    expect(restored.status()).toBe("UNBOUND");
  });

  it("CR-40: single use is per epoch; after rotation the old commitment is not in the new history", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    const oldHistory = b.snapshot().usedChallenges;
    expect(oldHistory).toHaveLength(1);
    const corrupt = AccountBinding.restore("garbage", options());
    expect(await corrupt.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 5)).toEqual(
      { status: "OK" },
    );
    expect(corrupt.snapshot().epoch).toBe(NEW_EPOCH);
    expect(await issue(corrupt, CHALLENGE, T0 + 6)).toEqual({ status: "OK" });
    expect(await bind(corrupt, CHALLENGE, T0 + 7)).toEqual({ status: "OK" });
    expect(corrupt.snapshot().challenge).toBeNull();
    expect(corrupt.snapshot().usedChallenges.every((c) => oldHistory.indexOf(c) === -1)).toBe(true);
  });

  it("CR-40: after rotation the same value gets a new commitment, never the old one", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 2);
    const corrupt = AccountBinding.restore(json(b.snapshot()), options());
    expect(corrupt.status()).toBe("REVOKED");
    const tampered = {
      ...(json(b.snapshot()) as Record<string, unknown>),
      recoveryRequired: true,
      binding: null,
      challenge: null,
    };
    const recovering = AccountBinding.restore({ ...tampered, usedChallenges: [] }, options());
    expect(recovering.status()).toBe("RECOVERY_REQUIRED");
    expect(
      await recovering.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 3),
    ).toEqual({ status: "OK" });
    expect(
      await recovering.issueChallenge(
        { accountId: ACCOUNT, challenge: CHALLENGE, authorization: OWNER },
        T0 + 4,
      ),
    ).toEqual({
      status: "OK",
    });
    expect(recovering.snapshot().challenge?.commitment).toBe(
      commit(CHALLENGE, scopeOf(NEW_EPOCH), ACCOUNT),
    );
    expect(recovering.snapshot().challenge?.commitment).not.toBe(
      commit(CHALLENGE, scopeOf(EPOCH), ACCOUNT),
    );
  });

  it("CR-41: recovery refuses an epoch already in the history, including a rollback to an older epoch", async () => {
    const b = AccountBinding.fresh(options());
    await bindDevice(b);
    const snap = json(b.snapshot()) as Record<string, unknown>;
    expect(snap["usedEpochs"]).toEqual([EPOCH]);
    const recovering = AccountBinding.restore(
      { ...snap, recoveryRequired: true, binding: null, challenge: null },
      options(),
    );
    expect(recovering.status()).toBe("RECOVERY_REQUIRED");
    expect(
      await recovering.recover(
        { confirmed: true, authorization: { proof: OWNER, epoch: EPOCH } },
        T0 + 1,
      ),
    ).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    expect(
      await recovering.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 2),
    ).toEqual({ status: "OK" });
    expect(recovering.snapshot().usedEpochs).toEqual([EPOCH, NEW_EPOCH]);
  });

  it("CR-41: a RECOVER policy that refuses a stale epoch leaves the device recovery-required", async () => {
    const stalePolicy: AccountAuthorizer = (action, account, authorization) => {
      if (action === "RECOVER") {
        const epoch = (authorization as { epoch?: unknown } | null)?.epoch;
        if (epoch === NEW_EPOCH) return Promise.resolve(false);
      }
      return twoApprovals(action, account, authorization);
    };
    const corrupt = AccountBinding.restore("garbage", options({ authorize: stalePolicy }));
    expect(await corrupt.recover({ confirmed: true, authorization: recoveryAuth }, T0 + 1)).toEqual(
      { status: "REFUSED", reason: "NOT_AUTHORIZED" },
    );
    expect(corrupt.status()).toBe("RECOVERY_REQUIRED");
    expect(corrupt.snapshot().usedEpochs).toEqual([]);
  });

  it("CR-37: consumed challenges are never evicted; when the history is full, new enrolment is refused", async () => {
    const b = AccountBinding.fresh(options({ maxUsedChallenges: 1 }));
    await bindDevice(b);
    await b.revoke({ confirmed: true, authorization: OWNER }, T0 + 5);
    expect(
      await b.issueChallenge(
        { accountId: ACCOUNT, challenge: "NEWCHALLENGE1", authorization: reenrol },
        T0 + 6,
      ),
    ).toEqual({ status: "REFUSED", reason: "HISTORY_FULL" });
    expect(await bind(b, CHALLENGE, T0 + 7)).toEqual({ status: "REFUSED", reason: "REPLAY" });
    expect(b.snapshot().usedChallenges).toHaveLength(1);
  });

  it("CR-37: a consumed challenge stays refused after restart, whatever the history capacity", async () => {
    const b = AccountBinding.fresh(options({ maxUsedChallenges: 5 }));
    await bindDevice(b);
    const restored = AccountBinding.restore(json(b.snapshot()), options({ maxUsedChallenges: 5 }));
    await restored.revoke({ confirmed: true, authorization: OWNER }, T0 + 5);
    expect(
      await restored.issueChallenge(
        { accountId: ACCOUNT, challenge: CHALLENGE, authorization: reenrol },
        T0 + 6,
      ),
    ).toEqual({ status: "OK" });
    expect(await bind(restored, CHALLENGE, T0 + 7)).toEqual({
      status: "REFUSED",
      reason: "REPLAY",
    });
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
    expect(results.filter((r) => r.status === "OK")).toHaveLength(1);
    expect(b.status()).toBe("BOUND");
  });

  it("rejects invalid configuration with INVALID_CONFIG", () => {
    expect(() => AccountBinding.fresh(options({ challengeTtlMs: 0 }))).toThrow(AccountError);
    expect(() => AccountBinding.fresh(options({ challengeTtlMs: 16 * 60 * 1000 }))).toThrow(
      AccountError,
    );
    expect(() => AccountBinding.fresh(options({ maxAttempts: 0 }))).toThrow(AccountError);
    expect(() => AccountBinding.fresh(options({ maxUsedChallenges: 0 }))).toThrow(AccountError);
    expect(() => AccountBinding.fresh(options({ epoch: "short" }))).toThrow(AccountError);
    expect(() =>
      AccountBinding.fresh({
        deviceId: "",
        epoch: EPOCH,
        authorize: ownerOnly,
        commit,
      }),
    ).toThrow(AccountError);
  });
});
