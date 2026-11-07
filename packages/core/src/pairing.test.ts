import { createHmac } from "node:crypto";
import { Pairing, PairingError } from "./pairing.js";
import type { OwnerAuthorizer, PairingOptions } from "./pairing.js";

const T0 = 1_000_000;
const CODE = "ABC123";
const OWNER = { token: "owner-proof" };
const KEY = "device-held-test-key";

/** Test commitment: keyed HMAC, as the platform would supply. Not reversible from the output. */
const commit = (code: string, peerId: string): string =>
  createHmac("sha256", KEY).update(`${peerId}|${code}`).digest("hex");

/** Owner authorizer: accepts only the owner proof, for any action. */
const ownerOnly: OwnerAuthorizer = (_action, _peerId, authorization) =>
  Promise.resolve(
    typeof authorization === "object" &&
      authorization !== null &&
      (authorization as { token?: unknown }).token === OWNER.token,
  );

function options(extra: Partial<PairingOptions> = {}): PairingOptions {
  return { authorize: ownerOnly, commit, ...extra };
}

function issue(p: Pairing, peerId: string, code: string, grants: string[], at: number) {
  return p.issueCode({ peerId, kind: "PHONE", code, grants, authorization: OWNER }, at);
}

function confirm(p: Pairing, peerId: string, code: unknown, at: number, confirmed: unknown = true) {
  return p.confirm({ peerId, code, confirmed, authorization: OWNER }, at);
}

async function pairPhone(p: Pairing, grants: string[] = ["VIEW_STATUS"], at = T0): Promise<void> {
  expect(await issue(p, "phone-1", CODE, grants, at)).toEqual({ status: "OK" });
  expect(await confirm(p, "phone-1", CODE, at + 1)).toEqual({ status: "OK" });
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("Pairing", () => {
  it("standalone operation needs no peer", () => {
    const p = Pairing.fresh(options());
    expect(p.standaloneAllowed()).toBe(true);
    expect(p.snapshot().peers).toEqual([]);
    expect(p.canUse("anyone", "VIEW_STATUS")).toBe(false);
  });

  it("a wrong code counts as an attempt; an expired code is refused", async () => {
    const p = Pairing.fresh(options({ codeTtlMs: 60_000, maxAttempts: 3 }));
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    expect(await confirm(p, "phone-1", "WRONG999", T0 + 1)).toEqual({
      status: "REFUSED",
      reason: "WRONG_CODE",
    });
    expect(p.snapshot().pending?.attempts).toBe(1);
    expect(await confirm(p, "phone-1", CODE, T0 + 60_001)).toEqual({
      status: "REFUSED",
      reason: "EXPIRED",
    });
    expect(p.snapshot().peers).toEqual([]);
  });

  it("after maxAttempts wrong codes the attempt is locked until the owner issues a new code", async () => {
    const p = Pairing.fresh(options({ maxAttempts: 3 }));
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    for (let i = 0; i < 3; i += 1) await confirm(p, "phone-1", "WRONG999", T0 + 1 + i);
    expect(p.snapshot().pending?.locked).toBe(true);
    expect(await confirm(p, "phone-1", CODE, T0 + 10)).toEqual({
      status: "REFUSED",
      reason: "LOCKED",
    });
    expect(await issue(p, "phone-1", "NEW456", ["VIEW_STATUS"], T0 + 20)).toEqual({ status: "OK" });
    expect(await confirm(p, "phone-1", "NEW456", T0 + 21)).toEqual({ status: "OK" });
  });

  it("valid confirmation pairs the peer with only its granted capabilities", async () => {
    const p = Pairing.fresh(options());
    await pairPhone(p, ["VIEW_STATUS"]);
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(true);
    expect(p.canUse("phone-1", "SYNC_DATA")).toBe(false);
  });

  it("a paired peer cannot be paired again", async () => {
    const p = Pairing.fresh(options());
    await pairPhone(p);
    expect(await issue(p, "phone-1", "XYZ789", ["VIEW_STATUS"], T0 + 5)).toEqual({
      status: "REFUSED",
      reason: "ALREADY_PAIRED",
    });
  });

  it("the capability check denies by default", async () => {
    const p = Pairing.fresh(options());
    await issue(p, "pc-1", CODE, ["SYNC_DATA"], T0);
    expect(p.canUse("pc-1", "SYNC_DATA")).toBe(false);
    expect(p.canUse("ghost", "VIEW_STATUS")).toBe(false);
    await pairPhone(p, ["VIEW_STATUS"]);
    expect(p.canUse("phone-1", "RECEIVE_AUDIO")).toBe(false);
  });

  it("unpairing removes all capabilities at once; re-pairing needs a fresh code", async () => {
    const p = Pairing.fresh(options());
    await pairPhone(p, ["VIEW_STATUS", "SYNC_DATA"]);
    expect(
      await p.unpair({ peerId: "phone-1", confirmed: true, authorization: OWNER }, T0 + 100),
    ).toEqual({
      status: "OK",
    });
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(false);
    expect(await confirm(p, "phone-1", CODE, T0 + 101)).toEqual({
      status: "REFUSED",
      reason: "NO_PENDING",
    });
    await pairPhone(p, ["VIEW_STATUS"], T0 + 200);
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(true);
  });

  it("pairing survives restart; corrupt saved state pairs nothing", async () => {
    const p = Pairing.fresh(options());
    await pairPhone(p, ["VIEW_STATUS"]);
    const restored = Pairing.restore(json(p.snapshot()), options());
    expect(restored.canUse("phone-1", "VIEW_STATUS")).toBe(true);

    const bad: unknown[] = [
      null,
      "x",
      { peers: [{ peerId: "phone-1", kind: "PHONE", grants: ["VIEW_STATUS"], paired: true }] },
      {
        peers: [{ peerId: "", kind: "PHONE", grants: [], paired: true }],
        pending: null,
        audit: [],
      },
      {
        peers: [{ peerId: "p", kind: "ALIEN", grants: [], paired: true }],
        pending: null,
        audit: [],
      },
      {
        peers: [{ peerId: "p", kind: "PC", grants: ["ROOT"], paired: true }],
        pending: null,
        audit: [],
      },
    ];
    for (const saved of bad) {
      const corrupt = Pairing.restore(saved, options());
      expect(corrupt.snapshot().peers).toEqual([]);
      expect(corrupt.canUse("phone-1", "VIEW_STATUS")).toBe(false);
    }
  });

  it("an expired or locked pending pairing cannot be confirmed even with the correct code", async () => {
    const p = Pairing.fresh(options({ codeTtlMs: 1_000, maxAttempts: 1 }));
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    expect(await confirm(p, "phone-1", CODE, T0 + 1_001)).toEqual({
      status: "REFUSED",
      reason: "EXPIRED",
    });
    await issue(p, "phone-2", CODE, ["VIEW_STATUS"], T0 + 2_000);
    await confirm(p, "phone-2", "WRONG999", T0 + 2_001);
    expect(await confirm(p, "phone-2", CODE, T0 + 2_002)).toEqual({
      status: "REFUSED",
      reason: "LOCKED",
    });
    expect(p.canUse("phone-2", "VIEW_STATUS")).toBe(false);
  });

  it("audit records applied changes only; refused requests are not recorded", async () => {
    const p = Pairing.fresh(options());
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    await confirm(p, "phone-1", CODE, T0 + 1, false);
    await confirm(p, "phone-1", CODE, T0 + 2);
    await p.unpair({ peerId: "phone-1", confirmed: false, authorization: OWNER }, T0 + 3);
    expect(p.snapshot().audit.map((a) => a.action)).toEqual(["ISSUED", "PAIRED"]);
  });

  it("rejects invalid configuration with INVALID_CONFIG", () => {
    expect(() => Pairing.fresh(options({ codeTtlMs: 0 }))).toThrow(PairingError);
    expect(() => Pairing.fresh(options({ codeTtlMs: 2 * 60 * 60 * 1000 }))).toThrow(PairingError);
    expect(() => Pairing.fresh(options({ maxAttempts: 0 }))).toThrow(PairingError);
    expect(() => Pairing.fresh(options({ maxAuditEntries: 5000 }))).toThrow(PairingError);
    expect(() => Pairing.fresh({ authorize: ownerOnly } as unknown as PairingOptions)).toThrow(
      PairingError,
    );
  });

  it("CR-32: issuing, confirming and unpairing each require trusted owner authorization; a boolean flag is not enough", async () => {
    const p = Pairing.fresh(options());
    const bad: unknown[] = [undefined, null, true, "owner-proof", { token: "wrong" }];
    for (const authorization of bad) {
      expect(
        await p.issueCode(
          { peerId: "phone-1", kind: "PHONE", code: CODE, grants: ["VIEW_STATUS"], authorization },
          T0,
        ),
      ).toEqual({ status: "REFUSED", reason: "NOT_AUTHORIZED" });
    }
    expect(p.snapshot().pending).toBeNull();

    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    for (const authorization of bad) {
      expect(
        await p.confirm({ peerId: "phone-1", code: CODE, confirmed: true, authorization }, T0 + 1),
      ).toEqual({
        status: "REFUSED",
        reason: "NOT_AUTHORIZED",
      });
    }
    expect(p.snapshot().peers).toEqual([]);

    await confirm(p, "phone-1", CODE, T0 + 2);
    for (const authorization of bad) {
      expect(await p.unpair({ peerId: "phone-1", confirmed: true, authorization }, T0 + 3)).toEqual(
        {
          status: "REFUSED",
          reason: "NOT_AUTHORIZED",
        },
      );
    }
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(true);
  });

  it("CR-32: a throwing authorizer refuses every action; explicit confirmation is still required", async () => {
    const throwing: OwnerAuthorizer = () => Promise.reject(new Error("verifier down"));
    const p = Pairing.fresh({ authorize: throwing, commit });
    expect(await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0)).toEqual({
      status: "REFUSED",
      reason: "NOT_AUTHORIZED",
    });
    const q = Pairing.fresh(options());
    await issue(q, "phone-1", CODE, ["VIEW_STATUS"], T0);
    expect(
      await q.confirm(
        { peerId: "phone-1", code: CODE, confirmed: false, authorization: OWNER },
        T0 + 1,
      ),
    ).toEqual({
      status: "REFUSED",
      reason: "NOT_CONFIRMED",
    });
  });

  it("CR-33: the plaintext code never appears in the snapshot, and the code cannot be recovered from serialized state", async () => {
    const p = Pairing.fresh(options());
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    const serialized = JSON.stringify(p.snapshot());
    expect(serialized).not.toContain(CODE);
    expect(JSON.stringify(p.snapshot().audit)).not.toContain(CODE);
    expect(p.snapshot().pending?.commitment).toBe(commit(CODE, "phone-1"));
    expect(await confirm(p, "phone-1", CODE, T0 + 1)).toEqual({ status: "OK" });
  });

  it("CR-33: a restored pending attempt still verifies the correct code and rejects others", async () => {
    const p = Pairing.fresh(options());
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    const restored = Pairing.restore(json(p.snapshot()), options());
    expect(await confirm(restored, "phone-1", "WRONG999", T0 + 1)).toEqual({
      status: "REFUSED",
      reason: "WRONG_CODE",
    });
    expect(await confirm(restored, "phone-1", CODE, T0 + 2)).toEqual({ status: "OK" });
  });

  it("CR-34: NaN, infinity and negative confirmation times are refused and cannot bypass expiry", async () => {
    const p = Pairing.fresh(options({ codeTtlMs: 1_000 }));
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(await confirm(p, "phone-1", CODE, at)).toEqual({
        status: "REFUSED",
        reason: "BAD_INPUT",
      });
    }
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(false);
  });

  it("CR-34: a confirmation dated before issuance is refused", async () => {
    const p = Pairing.fresh(options());
    await issue(p, "phone-1", CODE, ["VIEW_STATUS"], T0);
    expect(await confirm(p, "phone-1", CODE, T0 - 1)).toEqual({
      status: "REFUSED",
      reason: "BEFORE_ISSUE",
    });
    expect(p.snapshot().audit.map((a) => a.action)).toEqual(["ISSUED"]);
  });

  it("state hardening: duplicate peers, bad audit entries and inconsistent attempts are refused on restore", () => {
    const base = { peers: [], pending: null, audit: [] };
    const bad: unknown[] = [
      {
        peers: [
          { peerId: "p", kind: "PC", grants: [], paired: false },
          { peerId: "p", kind: "PC", grants: [], paired: false },
        ],
        pending: null,
        audit: [],
      },
      { ...base, audit: [{ action: "FORGED", peerId: "p", atMs: 1 }] },
      {
        ...base,
        pending: {
          peerId: "phone-9",
          kind: "PHONE",
          commitment: "abc",
          issuedAtMs: 0,
          expiresAtMs: 10,
          grants: [],
          attempts: 3,
          locked: false,
        },
      },
    ];
    for (const saved of bad) {
      expect(Pairing.restore(saved, options()).snapshot().peers).toEqual([]);
    }
  });
});
