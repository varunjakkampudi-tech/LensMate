import { Pairing, PairingError } from "./pairing.js";

const T0 = 1_000_000;
const CODE = "ABC123";

function pairPhone(p: Pairing, grants: string[] = ["VIEW_STATUS"], at = T0): void {
  expect(p.issueCode("phone-1", "PHONE", CODE, grants, at)).toEqual({ status: "OK" });
  expect(p.confirm("phone-1", CODE, true, at + 1)).toEqual({ status: "OK" });
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("Pairing", () => {
  it("standalone operation needs no peer", () => {
    const p = Pairing.fresh();
    expect(p.standaloneAllowed()).toBe(true);
    expect(p.snapshot().peers).toEqual([]);
    expect(p.canUse("anyone", "VIEW_STATUS")).toBe(false);
  });

  it("a wrong code counts as an attempt; an expired code is refused", () => {
    const p = Pairing.fresh({ codeTtlMs: 60_000, maxAttempts: 3 });
    p.issueCode("phone-1", "PHONE", CODE, ["VIEW_STATUS"], T0);
    expect(p.confirm("phone-1", "WRONG999", true, T0 + 1)).toEqual({
      status: "REFUSED",
      reason: "WRONG_CODE",
    });
    expect(p.snapshot().pending?.attempts).toBe(1);
    expect(p.confirm("phone-1", CODE, true, T0 + 60_001)).toEqual({
      status: "REFUSED",
      reason: "EXPIRED",
    });
    expect(p.snapshot().peers).toEqual([]);
  });

  it("after maxAttempts wrong codes the attempt is locked until the owner issues a new code", () => {
    const p = Pairing.fresh({ maxAttempts: 3 });
    p.issueCode("phone-1", "PHONE", CODE, ["VIEW_STATUS"], T0);
    for (let i = 0; i < 3; i += 1) p.confirm("phone-1", "WRONG999", true, T0 + 1 + i);
    expect(p.snapshot().pending?.locked).toBe(true);
    expect(p.confirm("phone-1", CODE, true, T0 + 10)).toEqual({
      status: "REFUSED",
      reason: "LOCKED",
    });
    expect(p.issueCode("phone-1", "PHONE", "NEW456", ["VIEW_STATUS"], T0 + 20)).toEqual({
      status: "OK",
    });
    expect(p.confirm("phone-1", "NEW456", true, T0 + 21)).toEqual({ status: "OK" });
  });

  it("valid confirmation pairs the peer with only its granted capabilities", () => {
    const p = Pairing.fresh();
    pairPhone(p, ["VIEW_STATUS"]);
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(true);
    expect(p.canUse("phone-1", "SYNC_DATA")).toBe(false);
    expect(p.snapshot().peers).toEqual([
      { peerId: "phone-1", kind: "PHONE", grants: ["VIEW_STATUS"], paired: true },
    ]);
  });

  it("a paired peer cannot be paired again", () => {
    const p = Pairing.fresh();
    pairPhone(p);
    expect(p.issueCode("phone-1", "PHONE", "XYZ789", ["VIEW_STATUS"], T0 + 5)).toEqual({
      status: "REFUSED",
      reason: "ALREADY_PAIRED",
    });
  });

  it("the capability check denies by default: unknown, unpaired and ungranted peers are refused", () => {
    const p = Pairing.fresh();
    p.issueCode("pc-1", "PC", CODE, ["SYNC_DATA"], T0);
    expect(p.canUse("pc-1", "SYNC_DATA")).toBe(false);
    expect(p.canUse("ghost", "VIEW_STATUS")).toBe(false);
    pairPhone(p, ["VIEW_STATUS"]);
    expect(p.canUse("phone-1", "RECEIVE_AUDIO")).toBe(false);
  });

  it("unpairing removes all capabilities at once; re-pairing needs a fresh code", () => {
    const p = Pairing.fresh();
    pairPhone(p, ["VIEW_STATUS", "SYNC_DATA"]);
    expect(p.unpair("phone-1", true, T0 + 100)).toEqual({ status: "OK" });
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(false);
    expect(p.confirm("phone-1", CODE, true, T0 + 101)).toEqual({
      status: "REFUSED",
      reason: "NO_PENDING",
    });
    expect(p.unpair("phone-1", true, T0 + 102)).toEqual({
      status: "REFUSED",
      reason: "NOT_PAIRED",
    });
    pairPhone(p, ["VIEW_STATUS"], T0 + 200);
    expect(p.canUse("phone-1", "VIEW_STATUS")).toBe(true);
  });

  it("pairing survives restart; corrupt saved state pairs nothing", () => {
    const p = Pairing.fresh();
    pairPhone(p, ["VIEW_STATUS"]);
    const restored = Pairing.restore(json(p.snapshot()));
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
      const corrupt = Pairing.restore(saved);
      expect(corrupt.snapshot().peers).toEqual([]);
      expect(corrupt.canUse("phone-1", "VIEW_STATUS")).toBe(false);
    }
  });

  it("an expired or locked pending pairing cannot be confirmed even with the correct code", () => {
    const p = Pairing.fresh({ codeTtlMs: 1_000, maxAttempts: 1 });
    p.issueCode("phone-1", "PHONE", CODE, ["VIEW_STATUS"], T0);
    expect(p.confirm("phone-1", CODE, true, T0 + 1_001)).toEqual({
      status: "REFUSED",
      reason: "EXPIRED",
    });
    p.issueCode("phone-2", "PHONE", CODE, ["VIEW_STATUS"], T0 + 2_000);
    p.confirm("phone-2", "WRONG999", true, T0 + 2_001);
    expect(p.confirm("phone-2", CODE, true, T0 + 2_002)).toEqual({
      status: "REFUSED",
      reason: "LOCKED",
    });
    expect(p.canUse("phone-2", "VIEW_STATUS")).toBe(false);
  });

  it("audit records applied changes only; refused requests are not recorded", () => {
    const p = Pairing.fresh();
    p.issueCode("phone-1", "PHONE", CODE, ["VIEW_STATUS"], T0);
    p.confirm("phone-1", CODE, false, T0 + 1);
    p.confirm("phone-1", CODE, true, T0 + 2);
    p.unpair("phone-1", false, T0 + 3);
    expect(p.snapshot().audit.map((a) => a.action)).toEqual(["ISSUED", "PAIRED"]);
  });

  it("rejects invalid configuration with INVALID_CONFIG", () => {
    expect(() => Pairing.fresh({ codeTtlMs: 0 })).toThrow(PairingError);
    expect(() => Pairing.fresh({ codeTtlMs: 2 * 60 * 60 * 1000 })).toThrow(PairingError);
    expect(() => Pairing.fresh({ maxAttempts: 0 })).toThrow(PairingError);
    expect(() => Pairing.fresh({ maxAuditEntries: 5000 })).toThrow(PairingError);
  });
});
