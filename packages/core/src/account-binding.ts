/**
 * Direct cloud account pairing without a mandatory phone (checklist B26).
 *
 * The glasses bind to a cloud account on their own. Issuing a challenge, binding, revoking and
 * re-enrolling each need trusted authorization from the platform. A challenge is short-lived and kept
 * only as a platform-supplied commitment. Binding also needs explicit ownership confirmation. An
 * existing binding is never transferred silently. Revocation is immediate. Re-enrolment after
 * revocation needs two separate approvals: the previous owner's release, and the target account's
 * binding. Single use holds per epoch: consumed challenges are never evicted within an epoch, and when
 * the history is full, new enrolment is refused. Recovery rotates the epoch, so a value consumed under
 * an old epoch has a different commitment afterwards; that is a separate challenge, not a replay. Epochs
 * are never reused: recovery refuses any epoch in the retained history, and the RECOVER policy must
 * prove freshness because corrupt state loses that history. Corrupt saved state does not become a fresh
 * device. It enters a recovery-required state that denies everything until trusted recovery.
 *
 * Pure logic: time, authorization and commitments come from the platform. The cloud account system and
 * the broker enrolment endpoint live outside this module.
 */

export type AccountAction = "CHALLENGE" | "BIND" | "REVOKE" | "RELEASE" | "REENROLL" | "RECOVER";
export type Status = "UNBOUND" | "BOUND" | "REVOKED" | "RECOVERY_REQUIRED";

/**
 * Trusted account authorization. Returns exactly true only when proven for this action and account.
 * For RECOVER no account is known, so accountId is the empty string and the policy must prove device
 * identity itself.
 */
export type AccountAuthorizer = (
  action: AccountAction,
  accountId: string,
  authorization: unknown,
) => Promise<unknown>;

/** Keyed, non-reversible commitment to a challenge, supplied by the platform. */
export type ChallengeCommitment = (
  challenge: string,
  deviceId: string,
  accountId: string,
) => string;

export interface Binding {
  readonly accountId: string;
  readonly status: "BOUND" | "REVOKED";
  readonly boundAtMs: number;
}

interface PendingChallenge {
  readonly accountId: string;
  readonly commitment: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly attempts: number;
  readonly locked: boolean;
}

export type AccountAuditAction =
  | "CHALLENGE_ISSUED"
  | "BOUND"
  | "REVOKED"
  | "RELEASED"
  | "WRONG_CHALLENGE"
  | "LOCKED"
  | "RECOVERED";

export interface AccountAuditEntry {
  readonly action: AccountAuditAction;
  readonly accountId: string;
  readonly atMs: number;
}

export interface AccountState {
  readonly deviceId: string;
  /** Commitment epoch. Rotated by trusted recovery, so challenges committed under an old epoch can never match again. */
  readonly epoch: string | null;
  readonly binding: Binding | null;
  readonly challenge: PendingChallenge | null;
  readonly recoveryRequired: boolean;
  readonly usedChallenges: readonly string[];
  /**
   * Every epoch this device has used, kept without eviction. A recovery epoch must be absent from this
   * list. Corrupt saved state loses the list, so after corrupt-state recovery the platform's RECOVER
   * policy must prove the new epoch is fresh against its own authoritative registry.
   */
  readonly usedEpochs: readonly string[];
  readonly audit: readonly AccountAuditEntry[];
}

export interface AccountOptions {
  readonly deviceId: string;
  /** Platform-generated, unique, at least 16 characters. Scopes every commitment. */
  readonly epoch: string;
  readonly authorize: AccountAuthorizer;
  readonly commit: ChallengeCommitment;
  /** Challenge lifetime in milliseconds. Positive, at most 15 minutes. */
  readonly challengeTtlMs?: number;
  /** Wrong challenges before the pending challenge locks. Integer 1 to 10. */
  readonly maxAttempts?: number;
  /** Most recent audit entries kept. Integer 1 to 1000. */
  readonly maxAuditEntries?: number;
  /** Maximum consumed challenges kept permanently. When full, new enrolment is refused. Integer 1 to 10000. */
  readonly maxUsedChallenges?: number;
}

export type AccountResult =
  | { readonly status: "OK" }
  | {
      readonly status: "REFUSED";
      readonly reason:
        | "BAD_INPUT"
        | "NOT_CONFIRMED"
        | "NOT_AUTHORIZED"
        | "ALREADY_BOUND"
        | "OWNERSHIP_CONFLICT"
        | "NO_CHALLENGE"
        | "ACCOUNT_MISMATCH"
        | "EXPIRED"
        | "BEFORE_ISSUE"
        | "LOCKED"
        | "REPLAY"
        | "WRONG_CHALLENGE"
        | "NOT_BOUND"
        | "RECOVERY_REQUIRED"
        | "HISTORY_FULL"
        | "NOT_RECOVERY_REQUIRED";
    };

export type AccountErrorCode = "INVALID_CONFIG";

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_AUDIT = 200;
const MAX_AUDIT = 1000;
const DEFAULT_USED = 1000;
const MAX_USED = 10_000;
const AUDIT_ACTIONS: readonly AccountAuditAction[] = [
  "CHALLENGE_ISSUED",
  "BOUND",
  "REVOKED",
  "RELEASED",
  "WRONG_CHALLENGE",
  "LOCKED",
  "RECOVERED",
];

interface Resolved {
  readonly ttl: number;
  readonly attempts: number;
  readonly audit: number;
  readonly used: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function resolveOptions(options: AccountOptions): Resolved {
  if (typeof options.authorize !== "function" || typeof options.commit !== "function") {
    throw new AccountError("INVALID_CONFIG", "authorize and commit are required");
  }
  if (typeof options.deviceId !== "string" || options.deviceId === "") {
    throw new AccountError("INVALID_CONFIG", "deviceId is required");
  }
  if (typeof options.epoch !== "string" || options.epoch.length < 16) {
    throw new AccountError(
      "INVALID_CONFIG",
      "epoch must be a platform-generated string of at least 16 characters",
    );
  }
  const ttl = options.challengeTtlMs ?? DEFAULT_TTL_MS;
  const attempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  const audit = options.maxAuditEntries ?? DEFAULT_AUDIT;
  const used = options.maxUsedChallenges ?? DEFAULT_USED;
  if (!isFiniteNumber(ttl) || ttl <= 0 || ttl > MAX_TTL_MS) {
    throw new AccountError(
      "INVALID_CONFIG",
      "challengeTtlMs must be positive and at most 15 minutes",
    );
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new AccountError("INVALID_CONFIG", "maxAttempts must be an integer from 1 to 10");
  }
  if (!Number.isInteger(audit) || audit < 1 || audit > MAX_AUDIT) {
    throw new AccountError("INVALID_CONFIG", "maxAuditEntries must be an integer from 1 to 1000");
  }
  if (!Number.isInteger(used) || used < 1 || used > MAX_USED) {
    throw new AccountError(
      "INVALID_CONFIG",
      "maxUsedChallenges must be an integer from 1 to 10000",
    );
  }
  return { ttl, attempts, audit, used };
}

/** Consistency check of saved state, including the consumed-challenge capacity. */
function validState(value: unknown, resolved: Resolved, deviceId: string): value is AccountState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s["deviceId"] !== deviceId) return false;
  if (typeof s["recoveryRequired"] !== "boolean") return false;
  const epoch = s["epoch"];
  if (s["recoveryRequired"]) {
    // Recovery-required state must hold no binding and no pending challenge; it cannot carry ownership.
    if (s["binding"] !== null || s["challenge"] !== null) return false;
    if (epoch !== null && (typeof epoch !== "string" || epoch.length < 16)) return false;
  } else if (typeof epoch !== "string" || epoch.length < 16) {
    return false;
  }
  if (!Array.isArray(s["usedChallenges"]) || !Array.isArray(s["audit"])) return false;
  const used = s["usedChallenges"] as unknown[];
  if (used.length > resolved.used) return false;
  if (!used.every((c) => typeof c === "string" && c !== "")) return false;
  const usedEpochs = s["usedEpochs"];
  if (!Array.isArray(usedEpochs) || usedEpochs.length > resolved.used) return false;
  if (!usedEpochs.every((e) => typeof e === "string" && e.length >= 16)) return false;
  if (typeof epoch === "string" && !usedEpochs.includes(epoch)) return false;
  const auditOk = (s["audit"] as unknown[]).every((a) => {
    if (typeof a !== "object" || a === null) return false;
    const e = a as Record<string, unknown>;
    return (
      typeof e["action"] === "string" &&
      (AUDIT_ACTIONS as readonly string[]).includes(e["action"]) &&
      typeof e["accountId"] === "string" &&
      isValidTime(e["atMs"])
    );
  });
  if (!auditOk) return false;
  const b = s["binding"];
  let bindingOk = b === null;
  if (typeof b === "object" && b !== null) {
    const r = b as Record<string, unknown>;
    bindingOk =
      typeof r["accountId"] === "string" &&
      r["accountId"] !== "" &&
      (r["status"] === "BOUND" || r["status"] === "REVOKED") &&
      isValidTime(r["boundAtMs"]);
  }
  const c = s["challenge"];
  let challengeOk = c === null;
  if (typeof c === "object" && c !== null) {
    const r = c as Record<string, unknown>;
    const attempts = r["attempts"];
    challengeOk =
      typeof r["accountId"] === "string" &&
      r["accountId"] !== "" &&
      typeof r["commitment"] === "string" &&
      r["commitment"] !== "" &&
      isValidTime(r["issuedAtMs"]) &&
      isFiniteNumber(r["expiresAtMs"]) &&
      r["expiresAtMs"] > r["issuedAtMs"] &&
      Number.isInteger(attempts) &&
      (attempts as number) >= 0 &&
      (attempts as number) <= resolved.attempts &&
      typeof r["locked"] === "boolean" &&
      r["locked"] === (attempts as number) >= resolved.attempts;
  }
  return bindingOk && challengeOk;
}

function copyState(state: AccountState): AccountState {
  return {
    deviceId: state.deviceId,
    epoch: state.epoch,
    binding: state.binding === null ? null : { ...state.binding },
    challenge: state.challenge === null ? null : { ...state.challenge },
    recoveryRequired: state.recoveryRequired,
    usedChallenges: [...state.usedChallenges],
    usedEpochs: [...state.usedEpochs],
    audit: state.audit.map((a) => ({ ...a })),
  };
}

function recoveryState(deviceId: string): AccountState {
  return {
    deviceId,
    epoch: null,
    binding: null,
    challenge: null,
    recoveryRequired: true,
    usedChallenges: [],
    usedEpochs: [],
    audit: [],
  };
}

export class AccountBinding {
  private state: AccountState;
  private readonly resolved: Resolved;
  private readonly authorize: AccountAuthorizer;
  private readonly commit: ChallengeCommitment;
  /** Serializes mutating operations so an authorization await cannot interleave with another change. */
  private chain: Promise<unknown> = Promise.resolve();

  private constructor(state: AccountState, options: AccountOptions) {
    this.resolved = resolveOptions(options);
    this.authorize = options.authorize;
    this.commit = options.commit;
    this.state = copyState(state);
  }

  /** A device that has never been enrolled. Only this path starts an unbound device. */
  static fresh(options: AccountOptions): AccountBinding {
    resolveOptions(options);
    return new AccountBinding(
      {
        deviceId: options.deviceId,
        epoch: options.epoch,
        binding: null,
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [],
        usedEpochs: [options.epoch],
        audit: [],
      },
      options,
    );
  }

  /**
   * Restores saved state. Corrupt or inconsistent state never becomes a fresh device: it enters
   * RECOVERY_REQUIRED, which denies enrolment and account use until trusted recovery.
   */
  static restore(saved: unknown, options: AccountOptions): AccountBinding {
    const resolved = resolveOptions(options);
    if (!validState(saved, resolved, options.deviceId)) {
      return new AccountBinding(recoveryState(options.deviceId), options);
    }
    return new AccountBinding(saved, options);
  }

  /** Local functions never depend on an account or a phone. */
  standaloneAllowed(): true {
    return true;
  }

  snapshot(): AccountState {
    return copyState(this.state);
  }

  /** Identity every commitment is scoped to: the device together with its current epoch. */
  private scope(): string {
    return `${this.state.deviceId}#${this.state.epoch ?? ""}`;
  }

  status(): Status {
    if (this.state.recoveryRequired) return "RECOVERY_REQUIRED";
    if (this.state.binding === null) return "UNBOUND";
    return this.state.binding.status === "BOUND" ? "BOUND" : "REVOKED";
  }

  /** Account-gated capability check. Denies by default: only a bound, unrevoked device for its own account. */
  canUseAccount(accountId: string): boolean {
    const b = this.state.binding;
    return (
      !this.state.recoveryRequired &&
      b !== null &&
      b.status === "BOUND" &&
      b.accountId === accountId
    );
  }

  /**
   * Issues a challenge for an account. A first binding needs CHALLENGE authorization. After a
   * revocation, the request must carry two approvals: RELEASE from the previous owner, and REENROLL for
   * the target account. The authorization for that case is an object with release and target fields.
   * A bound device is refused, and a recovery-required device is refused until trusted recovery.
   */
  issueChallenge(
    request: {
      readonly accountId: string;
      readonly challenge: unknown;
      readonly authorization: unknown;
    },
    atMs: number,
  ): Promise<AccountResult> {
    return this.serialize(async () => {
      if (
        typeof request.accountId !== "string" ||
        request.accountId === "" ||
        typeof request.challenge !== "string" ||
        !/^[A-Z0-9]{12,24}$/.test(request.challenge) ||
        !isValidTime(atMs)
      ) {
        return { status: "REFUSED", reason: "BAD_INPUT" };
      }
      if (this.state.recoveryRequired) return { status: "REFUSED", reason: "RECOVERY_REQUIRED" };
      const accountId = request.accountId;
      const current = this.status();
      if (current === "BOUND") return { status: "REFUSED", reason: "ALREADY_BOUND" };
      if (this.state.usedChallenges.length >= this.resolved.used) {
        return { status: "REFUSED", reason: "HISTORY_FULL" };
      }
      if (current === "REVOKED") {
        const previous = this.state.binding?.accountId ?? "";
        const approvals = request.authorization as { release?: unknown; target?: unknown } | null;
        const release =
          typeof approvals === "object" && approvals !== null ? approvals.release : undefined;
        const target =
          typeof approvals === "object" && approvals !== null ? approvals.target : undefined;
        if (
          !(await this.isAuthorized("RELEASE", previous, release)) ||
          !(await this.isAuthorized("REENROLL", accountId, target))
        ) {
          return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
        }
      } else if (!(await this.isAuthorized("CHALLENGE", accountId, request.authorization))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      this.state = {
        ...this.state,
        challenge: {
          accountId,
          commitment: this.commit(request.challenge, this.scope(), accountId),
          issuedAtMs: atMs,
          expiresAtMs: atMs + this.resolved.ttl,
          attempts: 0,
          locked: false,
        },
        audit: this.appendAudit("CHALLENGE_ISSUED", accountId, atMs),
      };
      return { status: "OK" };
    });
  }

  /**
   * Binds the device to the account. Needs trusted BIND authorization, exact-true ownership
   * confirmation, an unexpired and unlocked challenge for this account, and a challenge that has not
   * been consumed. A consumed challenge is refused as REPLAY before anything else is checked.
   */
  bind(
    request: {
      readonly accountId: string;
      readonly challenge: unknown;
      readonly confirmed: unknown;
      readonly authorization: unknown;
    },
    atMs: number,
  ): Promise<AccountResult> {
    return this.serialize(async () => {
      if (request.confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
      if (
        typeof request.challenge !== "string" ||
        !isValidTime(atMs) ||
        typeof request.accountId !== "string"
      ) {
        return { status: "REFUSED", reason: "BAD_INPUT" };
      }
      if (this.state.recoveryRequired) return { status: "REFUSED", reason: "RECOVERY_REQUIRED" };
      const accountId = request.accountId;
      const commitment = this.commit(request.challenge, this.scope(), accountId);
      if (this.state.usedChallenges.includes(commitment)) {
        return { status: "REFUSED", reason: "REPLAY" };
      }
      if (!(await this.isAuthorized("BIND", accountId, request.authorization))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      const current = this.state.binding;
      if (current !== null && current.status === "BOUND") {
        return {
          status: "REFUSED",
          reason: current.accountId === accountId ? "ALREADY_BOUND" : "OWNERSHIP_CONFLICT",
        };
      }
      const challenge = this.state.challenge;
      if (challenge === null) return { status: "REFUSED", reason: "NO_CHALLENGE" };
      if (challenge.accountId !== accountId)
        return { status: "REFUSED", reason: "ACCOUNT_MISMATCH" };
      if (atMs < challenge.issuedAtMs) return { status: "REFUSED", reason: "BEFORE_ISSUE" };
      if (atMs > challenge.expiresAtMs) return { status: "REFUSED", reason: "EXPIRED" };
      if (challenge.locked) return { status: "REFUSED", reason: "LOCKED" };
      if (commitment !== challenge.commitment) {
        const attempts = challenge.attempts + 1;
        const locked = attempts >= this.resolved.attempts;
        this.state = {
          ...this.state,
          challenge: { ...challenge, attempts, locked },
          audit: this.appendAudit(locked ? "LOCKED" : "WRONG_CHALLENGE", accountId, atMs),
        };
        return { status: "REFUSED", reason: "WRONG_CHALLENGE" };
      }
      if (this.state.usedChallenges.length >= this.resolved.used) {
        return { status: "REFUSED", reason: "HISTORY_FULL" };
      }
      this.state = {
        deviceId: this.state.deviceId,
        epoch: this.state.epoch,
        binding: { accountId, status: "BOUND", boundAtMs: atMs },
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [...this.state.usedChallenges, commitment],
        usedEpochs: [...this.state.usedEpochs],
        audit: this.appendAudit("BOUND", accountId, atMs),
      };
      return { status: "OK" };
    });
  }

  /** Revokes the binding. Immediate and terminal for this binding; account capabilities stop at once. */
  revoke(
    request: { readonly confirmed: unknown; readonly authorization: unknown },
    atMs: number,
  ): Promise<AccountResult> {
    return this.serialize(async () => {
      if (request.confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
      if (!isValidTime(atMs)) return { status: "REFUSED", reason: "BAD_INPUT" };
      if (this.state.recoveryRequired) return { status: "REFUSED", reason: "RECOVERY_REQUIRED" };
      const binding = this.state.binding;
      if (binding === null || binding.status !== "BOUND")
        return { status: "REFUSED", reason: "NOT_BOUND" };
      if (!(await this.isAuthorized("REVOKE", binding.accountId, request.authorization))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      this.state = {
        ...this.state,
        binding: { ...binding, status: "REVOKED" },
        audit: this.appendAudit("REVOKED", binding.accountId, atMs),
      };
      return { status: "OK" };
    });
  }

  /**
   * Trusted recovery from RECOVERY_REQUIRED. Needs RECOVER authorization that proves device-level
   * identity, plus exact-true confirmation. Recovery restores the device to UNBOUND only; it does not
   * restore any previous binding, so the next enrolment still needs its own challenge.
   */
  recover(
    request: { readonly confirmed: unknown; readonly authorization: unknown },
    atMs: number,
  ): Promise<AccountResult> {
    return this.serialize(async () => {
      if (request.confirmed !== true) return { status: "REFUSED", reason: "NOT_CONFIRMED" };
      if (!isValidTime(atMs)) return { status: "REFUSED", reason: "BAD_INPUT" };
      if (!this.state.recoveryRequired)
        return { status: "REFUSED", reason: "NOT_RECOVERY_REQUIRED" };
      // The authorization carries the device-identity proof and a new, never-used epoch.
      const parts = request.authorization as { proof?: unknown; epoch?: unknown } | null;
      const proof = typeof parts === "object" && parts !== null ? parts.proof : undefined;
      const epoch = typeof parts === "object" && parts !== null ? parts.epoch : undefined;
      if (typeof epoch !== "string" || epoch.length < 16 || epoch === this.state.epoch) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      // A stale or reused epoch is refused before the platform is asked. Corrupt state carries no
      // history, so the RECOVER policy must also prove freshness for the new epoch.
      if (this.state.usedEpochs.includes(epoch)) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      if (this.state.usedEpochs.length >= this.resolved.used) {
        return { status: "REFUSED", reason: "HISTORY_FULL" };
      }
      if (!(await this.isAuthorized("RECOVER", "", { proof, epoch }))) {
        return { status: "REFUSED", reason: "NOT_AUTHORIZED" };
      }
      // Recovery never restores a binding. Rotating the epoch makes every earlier commitment unreachable.
      this.state = {
        deviceId: this.state.deviceId,
        epoch,
        binding: null,
        challenge: null,
        recoveryRequired: false,
        usedChallenges: [...this.state.usedChallenges],
        usedEpochs: [...this.state.usedEpochs, epoch],
        audit: this.appendAudit("RECOVERED", "", atMs),
      };
      return { status: "OK" };
    });
  }

  private async isAuthorized(
    action: AccountAction,
    accountId: string,
    authorization: unknown,
  ): Promise<boolean> {
    let granted: unknown;
    try {
      granted = await this.authorize(action, accountId, authorization);
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

  private appendAudit(
    action: AccountAuditAction,
    accountId: string,
    atMs: number,
  ): AccountAuditEntry[] {
    return [...this.state.audit, { action, accountId, atMs }].slice(-this.resolved.audit);
  }
}
