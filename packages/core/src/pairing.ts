/**
 * Optional phone, PC and accessory pairing (checklist B25).
 *
 * The glasses work standalone; a paired peer only adds capabilities. Pairing needs an owner
 * confirmation that carries the current, unexpired code. Wrong codes are counted, and too many
 * lock the attempt until the owner issues a new code. A paired peer may use only the capabilities
 * granted at pairing. Unpairing removes everything at once. Corrupt saved state pairs nothing.
 *
 * Pure logic: the platform supplies time and the peer's authenticated id, and runs the transport.
 * Peer authentication itself is the platform's job; this module trusts only the id it is given.
 */

export type PeerKind = "PHONE" | "PC" | "ACCESSORY";
export type Capability = "VIEW_STATUS" | "RECEIVE_AUDIO" | "SYNC_DATA";

const KINDS: readonly PeerKind[] = ["PHONE", "PC", "ACCESSORY"];
const CAPABILITIES: readonly Capability[] = ["VIEW_STATUS", "RECEIVE_AUDIO", "SYNC_DATA"];

export interface PendingPairing {
  readonly peerId: string;
  readonly kind: PeerKind;
  readonly code: string;
  readonly expiresAtMs: number;
  readonly grants: readonly Capability[];
  readonly attempts: number;
  readonly locked: boolean;
}

export interface PeerRecord {
  readonly peerId: string;
  readonly kind: PeerKind;
  readonly grants: readonly Capability[];
  readonly paired: boolean;
}

export interface PairingAuditEntry {
  readonly action: "ISSUED" | "PAIRED" | "UNPAIRED" | "WRONG_CODE" | "LOCKED";
  readonly peerId: string;
  readonly atMs: number;
}

export interface PairingState {
  readonly peers: readonly PeerRecord[];
  readonly pending: PendingPairing | null;
  readonly audit: readonly PairingAuditEntry[];
}

export interface PairingOptions {
  /** Lifetime of a confirmation code, in milliseconds. Positive, at most 1 hour. */
  readonly codeTtlMs?: number;
  /** Wrong codes before the pending attempt locks. Integer 1 to 10. */
  readonly maxAttempts?: number;
  /** Most recent audit entries kept. Integer 1 to 1000. */
  readonly maxAuditEntries?: number;
}

export type PairingResult =
  | { readonly status: "OK" }
  | {
      readonly status: "REFUSED";
      readonly reason:
        | "BAD_INPUT"
        | "ALREADY_PAIRED"
        | "NO_PENDING"
        | "EXPIRED"
        | "LOCKED"
        | "NOT_CONFIRMED"
        | "WRONG_CODE"
        | "UNKNOWN_PEER"
        | "NOT_PAIRED";
    };

export type PairingErrorCode = "PAIRING_CORRUPT" | "INVALID_CONFIG";

export class PairingError extends Error {
  constructor(
    readonly code: PairingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PairingError";
  }
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_AUDIT = 200;
const MAX_AUDIT = 1000;

function isKind(value: unknown): value is PeerKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validState(value: unknown): value is PairingState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (!Array.isArray(s["peers"]) || !Array.isArray(s["audit"])) return false;
  const peersOk = (s["peers"] as unknown[]).every((p) => {
    if (typeof p !== "object" || p === null) return false;
    const r = p as Record<string, unknown>;
    return (
      typeof r["peerId"] === "string" &&
      r["peerId"] !== "" &&
      isKind(r["kind"]) &&
      Array.isArray(r["grants"]) &&
      (r["grants"] as unknown[]).every(isCapability) &&
      typeof r["paired"] === "boolean"
    );
  });
  const pending = s["pending"];
  const pendingOk =
    pending === null ||
    (typeof pending === "object" &&
      typeof (pending as Record<string, unknown>)["peerId"] === "string" &&
      isKind((pending as Record<string, unknown>)["kind"]) &&
      typeof (pending as Record<string, unknown>)["code"] === "string" &&
      isFiniteNumber((pending as Record<string, unknown>)["expiresAtMs"]) &&
      isFiniteNumber((pending as Record<string, unknown>)["attempts"]) &&
      typeof (pending as Record<string, unknown>)["locked"] === "boolean" &&
      Array.isArray((pending as Record<string, unknown>)["grants"]) &&
      ((pending as Record<string, unknown>)["grants"] as unknown[]).every(isCapability));
  return peersOk && pendingOk;
}

function copyState(state: PairingState): PairingState {
  return {
    peers: state.peers.map((p) => ({ ...p, grants: [...p.grants] })),
    pending:
      state.pending === null ? null : { ...state.pending, grants: [...state.pending.grants] },
    audit: state.audit.map((a) => ({ ...a })),
  };
}

function resolveOptions(options: PairingOptions): { ttl: number; attempts: number; audit: number } {
  const ttl = options.codeTtlMs ?? DEFAULT_TTL_MS;
  const attempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  const audit = options.maxAuditEntries ?? DEFAULT_AUDIT;
  if (!isFiniteNumber(ttl) || ttl <= 0 || ttl > MAX_TTL_MS) {
    throw new PairingError("INVALID_CONFIG", "codeTtlMs must be positive and at most 1 hour");
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new PairingError("INVALID_CONFIG", "maxAttempts must be an integer from 1 to 10");
  }
  if (!Number.isInteger(audit) || audit < 1 || audit > MAX_AUDIT) {
    throw new PairingError("INVALID_CONFIG", "maxAuditEntries must be an integer from 1 to 1000");
  }
  return { ttl, attempts, audit };
}

export class Pairing {
  private state: PairingState;
  private readonly ttl: number;
  private readonly maxAttempts: number;
  private readonly maxAudit: number;

  private constructor(state: PairingState, options: PairingOptions) {
    const r = resolveOptions(options);
    this.ttl = r.ttl;
    this.maxAttempts = r.attempts;
    this.maxAudit = r.audit;
    this.state = copyState(state);
  }

  /** No peers. The glasses work standalone from this state. */
  static fresh(options: PairingOptions = {}): Pairing {
    return new Pairing({ peers: [], pending: null, audit: [] }, options);
  }

  /** Corrupt saved state pairs nothing: every peer is restored as unpaired, and no pending code survives. */
  static restore(saved: unknown, options: PairingOptions = {}): Pairing {
    if (!validState(saved)) {
      return new Pairing({ peers: [], pending: null, audit: [] }, options);
    }
    const peers = saved.peers.map((p) => ({ ...p, grants: [...p.grants] }));
    return new Pairing(
      {
        peers: peers.map((p) => ({ ...p, paired: p.paired })),
        pending: saved.pending,
        audit: saved.audit,
      },
      options,
    );
  }

  /** The glasses' own functions never depend on a peer. */
  standaloneAllowed(): true {
    return true;
  }

  snapshot(): PairingState {
    return copyState(this.state);
  }

  /** Capability check. Denies by default: only a PAIRED peer with that grant passes. */
  canUse(peerId: string, capability: Capability): boolean {
    const peer = this.state.peers.find((p) => p.peerId === peerId);
    return peer !== undefined && peer.paired && peer.grants.includes(capability);
  }

  /** Owner issues a confirmation code for a peer. Replaces any earlier pending attempt. */
  issueCode(
    peerId: string,
    kind: string,
    code: string,
    grants: readonly string[],
    atMs: number,
  ): PairingResult {
    if (!isKind(kind) || peerId === "" || !/^[A-Z0-9]{6,12}$/.test(code) || !isFiniteNumber(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (!grants.every(isCapability)) return { status: "REFUSED", reason: "BAD_INPUT" };
    if (this.state.peers.some((p) => p.peerId === peerId && p.paired)) {
      return { status: "REFUSED", reason: "ALREADY_PAIRED" };
    }
    const pending: PendingPairing = {
      peerId,
      kind,
      code,
      expiresAtMs: atMs + this.ttl,
      grants: [...new Set(grants)] as Capability[],
      attempts: 0,
      locked: false,
    };
    this.state = { ...this.state, pending, audit: this.appendAudit("ISSUED", peerId, atMs) };
    return { status: "OK" };
  }

  /**
   * Owner confirms a pairing. Requires confirmed exactly true, the pending peer, an unexpired code
   * and a locked-free attempt. A wrong code counts toward the lockout. Refused requests change nothing.
   */
  confirm(peerId: string, code: unknown, confirmed: unknown, atMs: number): PairingResult {
    if (confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
    const pending = this.state.pending;
    if (pending === null || pending.peerId !== peerId)
      return { status: "REFUSED", reason: "NO_PENDING" };
    if (this.state.peers.some((p) => p.peerId === peerId && p.paired)) {
      return { status: "REFUSED", reason: "ALREADY_PAIRED" };
    }
    if (pending.locked) return { status: "REFUSED", reason: "LOCKED" };
    if (atMs > pending.expiresAtMs) return { status: "REFUSED", reason: "EXPIRED" };
    if (code !== pending.code) {
      const attempts = pending.attempts + 1;
      const locked = attempts >= this.maxAttempts;
      this.state = {
        ...this.state,
        pending: { ...pending, attempts, locked },
        audit: this.appendAudit(locked ? "LOCKED" : "WRONG_CODE", peerId, atMs),
      };
      return { status: "REFUSED", reason: "WRONG_CODE" };
    }
    const record: PeerRecord = {
      peerId,
      kind: pending.kind,
      grants: [...pending.grants],
      paired: true,
    };
    const peers = [...this.state.peers.filter((p) => p.peerId !== peerId), record];
    this.state = {
      peers,
      pending: null,
      audit: this.appendAudit("PAIRED", peerId, atMs),
    };
    return { status: "OK" };
  }

  /** Owner removes a pairing. Capabilities go at once; re-pairing needs a new code. */
  unpair(peerId: string, confirmed: unknown, atMs: number): PairingResult {
    if (confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
    const peer = this.state.peers.find((p) => p.peerId === peerId);
    if (peer === undefined || !peer.paired) return { status: "REFUSED", reason: "NOT_PAIRED" };
    const peers = this.state.peers.map((p) =>
      p.peerId === peerId ? { ...p, grants: [], paired: false } : p,
    );
    this.state = { ...this.state, peers, audit: this.appendAudit("UNPAIRED", peerId, atMs) };
    return { status: "OK" };
  }

  private appendAudit(
    action: PairingAuditEntry["action"],
    peerId: string,
    atMs: number,
  ): PairingAuditEntry[] {
    return [...this.state.audit, { action, peerId, atMs }].slice(-this.maxAudit);
  }
}
