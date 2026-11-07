/**
 * Optional phone, PC and accessory pairing (checklist B25).
 *
 * The glasses work standalone; a paired peer only adds capabilities. Every change to pairing (issuing
 * a code, confirming a pairing, unpairing) needs trusted owner authorization from the platform and an
 * explicit confirmation flag. Confirmation codes are never stored or exported: only a commitment the
 * platform computes (keyed and non-reversible) is kept. Wrong codes are counted, and too many lock the
 * attempt until the owner issues a new code. Confirmation times must be finite, non-negative and not
 * before issuance. Corrupt or inconsistent saved state pairs nothing.
 *
 * Pure logic: time, owner authorization and the code commitment come from the platform. Peer
 * authentication is also the platform's job; this module trusts only the peer id it is given.
 */

export type PeerKind = "PHONE" | "PC" | "ACCESSORY";
export type Capability = "VIEW_STATUS" | "RECEIVE_AUDIO" | "SYNC_DATA";
export type OwnerAction = "ISSUE" | "CONFIRM" | "UNPAIR";
export type AuditAction = "ISSUED" | "PAIRED" | "UNPAIRED" | "WRONG_CODE" | "LOCKED";

/**
 * Trusted owner authorization supplied by the platform. Returns exactly true only when the
 * authorization value proves owner authority for this action on this peer. Anything else, or a throw,
 * is refused.
 */
export type OwnerAuthorizer = (
  action: OwnerAction,
  peerId: string,
  authorization: unknown,
) => Promise<unknown>;

/**
 * Commitment to a pairing code, supplied by the platform as a keyed, non-reversible function (for
 * example an HMAC with a device-held key). The module stores only its output.
 */
export type CodeCommitment = (code: string, peerId: string) => string;

const KINDS: readonly PeerKind[] = ["PHONE", "PC", "ACCESSORY"];
const CAPABILITIES: readonly Capability[] = ["VIEW_STATUS", "RECEIVE_AUDIO", "SYNC_DATA"];
const AUDIT_ACTIONS: readonly AuditAction[] = [
  "ISSUED",
  "PAIRED",
  "UNPAIRED",
  "WRONG_CODE",
  "LOCKED",
];

interface PendingPairing {
  readonly peerId: string;
  readonly kind: PeerKind;
  readonly commitment: string;
  readonly issuedAtMs: number;
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
  readonly action: AuditAction;
  readonly peerId: string;
  readonly atMs: number;
}

export interface PairingState {
  readonly peers: readonly PeerRecord[];
  readonly pending: PendingPairing | null;
  readonly audit: readonly PairingAuditEntry[];
}

export interface PairingOptions {
  /** Trusted owner authorization. Required. */
  readonly authorize: OwnerAuthorizer;
  /** Code commitment. Required. Must be keyed and non-reversible. */
  readonly commit: CodeCommitment;
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
        | "NOT_CONFIRMED"
        | "NOT_AUTHORIZED"
        | "ALREADY_PAIRED"
        | "NO_PENDING"
        | "EXPIRED"
        | "BEFORE_ISSUE"
        | "LOCKED"
        | "WRONG_CODE"
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

interface Resolved {
  readonly ttl: number;
  readonly attempts: number;
  readonly audit: number;
}

function isKind(value: unknown): value is PeerKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function resolveOptions(options: PairingOptions): Resolved {
  if (typeof options.authorize !== "function" || typeof options.commit !== "function") {
    throw new PairingError("INVALID_CONFIG", "authorize and commit are required");
  }
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

/**
 * Full consistency check of saved state. Peers are unique; a paired peer holds grants and an
 * unpaired one holds none; audit entries are well formed; a pending attempt is for an unpaired peer
 * and its locked flag matches its attempt count.
 */
function validState(value: unknown, maxAttempts: number): value is PairingState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (!Array.isArray(s["peers"]) || !Array.isArray(s["audit"])) return false;
  const peers = s["peers"] as unknown[];
  const pairedIds = new Set<string>();
  const seenIds = new Set<string>();
  const peersOk = peers.every((p) => {
    if (typeof p !== "object" || p === null) return false;
    const r = p as Record<string, unknown>;
    if (typeof r["peerId"] !== "string" || r["peerId"] === "" || seenIds.has(r["peerId"]))
      return false;
    seenIds.add(r["peerId"]);
    if (!isKind(r["kind"]) || typeof r["paired"] !== "boolean") return false;
    if (!Array.isArray(r["grants"]) || !(r["grants"] as unknown[]).every(isCapability))
      return false;
    if (!r["paired"] && (r["grants"] as unknown[]).length > 0) return false;
    if (r["paired"]) pairedIds.add(r["peerId"]);
    return true;
  });
  const auditOk = (s["audit"] as unknown[]).every((a) => {
    if (typeof a !== "object" || a === null) return false;
    const e = a as Record<string, unknown>;
    return (
      typeof e["action"] === "string" &&
      (AUDIT_ACTIONS as readonly string[]).includes(e["action"]) &&
      typeof e["peerId"] === "string" &&
      isValidTime(e["atMs"])
    );
  });
  const pending = s["pending"];
  let pendingOk = pending === null;
  if (typeof pending === "object" && pending !== null) {
    const p = pending as Record<string, unknown>;
    const attempts = p["attempts"];
    pendingOk =
      typeof p["peerId"] === "string" &&
      p["peerId"] !== "" &&
      !pairedIds.has(p["peerId"]) &&
      isKind(p["kind"]) &&
      typeof p["commitment"] === "string" &&
      p["commitment"] !== "" &&
      isValidTime(p["issuedAtMs"]) &&
      isFiniteNumber(p["expiresAtMs"]) &&
      p["expiresAtMs"] > p["issuedAtMs"] &&
      Array.isArray(p["grants"]) &&
      (p["grants"] as unknown[]).every(isCapability) &&
      Number.isInteger(attempts) &&
      (attempts as number) >= 0 &&
      (attempts as number) <= maxAttempts &&
      typeof p["locked"] === "boolean" &&
      p["locked"] === (attempts as number) >= maxAttempts;
  }
  return peersOk && auditOk && pendingOk;
}

function copyState(state: PairingState): PairingState {
  return {
    peers: state.peers.map((p) => ({ ...p, grants: [...p.grants] })),
    pending:
      state.pending === null ? null : { ...state.pending, grants: [...state.pending.grants] },
    audit: state.audit.map((a) => ({ ...a })),
  };
}

export class Pairing {
  private state: PairingState;
  private readonly resolved: Resolved;
  private readonly authorize: OwnerAuthorizer;
  private readonly commit: CodeCommitment;
  /** Serializes mutating operations so an authorization await cannot interleave with another change. */
  private chain: Promise<unknown> = Promise.resolve();

  private constructor(state: PairingState, options: PairingOptions) {
    this.resolved = resolveOptions(options);
    this.authorize = options.authorize;
    this.commit = options.commit;
    this.state = copyState(state);
  }

  /** No peers. The glasses work standalone from this state. */
  static fresh(options: PairingOptions): Pairing {
    return new Pairing({ peers: [], pending: null, audit: [] }, options);
  }

  /** Corrupt or inconsistent saved state pairs nothing: every peer is restored as unpaired. */
  static restore(saved: unknown, options: PairingOptions): Pairing {
    const resolved = resolveOptions(options);
    if (!validState(saved, resolved.attempts)) {
      return new Pairing({ peers: [], pending: null, audit: [] }, options);
    }
    return new Pairing(saved, options);
  }

  /** The glasses' own functions never depend on a peer. */
  standaloneAllowed(): true {
    return true;
  }

  /** A deep copy. It never contains a plaintext pairing code. */
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
    request: {
      readonly peerId: string;
      readonly kind: unknown;
      readonly code: unknown;
      readonly grants: unknown;
      readonly authorization: unknown;
    },
    atMs: number,
  ): Promise<PairingResult> {
    return this.serialize(async () => {
      if (
        typeof request.peerId !== "string" ||
        request.peerId === "" ||
        !isKind(request.kind) ||
        typeof request.code !== "string" ||
        !/^[A-Z0-9]{6,12}$/.test(request.code) ||
        !isValidTime(atMs) ||
        !Array.isArray(request.grants) ||
        !request.grants.every(isCapability)
      ) {
        return { status: "REFUSED", reason: "BAD_INPUT" };
      }
      const peerId = request.peerId;
      if (!(await this.isAuthorized("ISSUE", peerId, request.authorization))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      if (this.state.peers.some((p) => p.peerId === peerId && p.paired)) {
        return { status: "REFUSED", reason: "ALREADY_PAIRED" };
      }
      const pending: PendingPairing = {
        peerId,
        kind: request.kind,
        commitment: this.commit(request.code, peerId),
        issuedAtMs: atMs,
        expiresAtMs: atMs + this.resolved.ttl,
        grants: [...new Set(request.grants)],
        attempts: 0,
        locked: false,
      };
      this.state = { ...this.state, pending, audit: this.appendAudit("ISSUED", peerId, atMs) };
      return { status: "OK" };
    });
  }

  /**
   * Owner confirms a pairing with the code. Needs trusted authorization, confirmed exactly true, a
   * finite time not before issuance, and an unexpired, unlocked attempt. A wrong code counts toward
   * the lockout. Refused requests change nothing.
   */
  confirm(
    request: {
      readonly peerId: string;
      readonly code: unknown;
      readonly confirmed: unknown;
      readonly authorization: unknown;
    },
    atMs: number,
  ): Promise<PairingResult> {
    return this.serialize(async () => {
      if (request.confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
      if (!isValidTime(atMs)) return { status: "REFUSED", reason: "BAD_INPUT" };
      if (!(await this.isAuthorized("CONFIRM", request.peerId, request.authorization))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      const pending = this.state.pending;
      if (pending === null || pending.peerId !== request.peerId) {
        return { status: "REFUSED", reason: "NO_PENDING" };
      }
      if (this.state.peers.some((p) => p.peerId === request.peerId && p.paired)) {
        return { status: "REFUSED", reason: "ALREADY_PAIRED" };
      }
      if (atMs < pending.issuedAtMs) return { status: "REFUSED", reason: "BEFORE_ISSUE" };
      if (atMs > pending.expiresAtMs) return { status: "REFUSED", reason: "EXPIRED" };
      if (pending.locked) return { status: "REFUSED", reason: "LOCKED" };
      const matches =
        typeof request.code === "string" &&
        this.commit(request.code, request.peerId) === pending.commitment;
      if (!matches) {
        const attempts = pending.attempts + 1;
        const locked = attempts >= this.resolved.attempts;
        this.state = {
          ...this.state,
          pending: { ...pending, attempts, locked },
          audit: this.appendAudit(locked ? "LOCKED" : "WRONG_CODE", request.peerId, atMs),
        };
        return { status: "REFUSED", reason: "WRONG_CODE" };
      }
      const record: PeerRecord = {
        peerId: request.peerId,
        kind: pending.kind,
        grants: [...pending.grants],
        paired: true,
      };
      this.state = {
        peers: [...this.state.peers.filter((p) => p.peerId !== request.peerId), record],
        pending: null,
        audit: this.appendAudit("PAIRED", request.peerId, atMs),
      };
      return { status: "OK" };
    });
  }

  /** Owner removes a pairing. Capabilities go at once; re-pairing needs a fresh code. */
  unpair(
    request: {
      readonly peerId: string;
      readonly confirmed: unknown;
      readonly authorization: unknown;
    },
    atMs: number,
  ): Promise<PairingResult> {
    return this.serialize(async () => {
      if (request.confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
      if (!isValidTime(atMs)) return { status: "REFUSED", reason: "BAD_INPUT" };
      if (!(await this.isAuthorized("UNPAIR", request.peerId, request.authorization))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      const peer = this.state.peers.find((p) => p.peerId === request.peerId);
      if (peer === undefined || !peer.paired) return { status: "REFUSED", reason: "NOT_PAIRED" };
      this.state = {
        ...this.state,
        peers: this.state.peers.map((p) =>
          p.peerId === request.peerId ? { ...p, grants: [], paired: false } : p,
        ),
        audit: this.appendAudit("UNPAIRED", request.peerId, atMs),
      };
      return { status: "OK" };
    });
  }

  private async isAuthorized(
    action: OwnerAction,
    peerId: string,
    authorization: unknown,
  ): Promise<boolean> {
    let granted: unknown;
    try {
      granted = await this.authorize(action, peerId, authorization);
    } catch {
      granted = false;
    }
    return granted === true;
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private appendAudit(action: AuditAction, peerId: string, atMs: number): PairingAuditEntry[] {
    return [...this.state.audit, { action, peerId, atMs }].slice(-this.resolved.audit);
  }
}
