/**
 * Factory reset and secure data erasure (checklist B22).
 *
 * A reset runs a fixed, ordered list of steps supplied by the platform adapter. Progress is saved
 * after every step, so a restart resumes at the first unfinished step. The reset reports COMPLETE
 * only after the verification step confirms erasure and remote revocation has succeeded. A failed
 * or offline step is never reported as complete.
 *
 * Authorization: confirmation alone never starts a reset. The caller must also pass an
 * authorization value that the injected trusted policy accepts for this reset id. The platform
 * supplies that policy. This module does not verify cryptographic proof itself.
 *
 * Concurrency: one FactoryReset instance runs one advance at a time (calls are serialized). Several
 * instances that share one ResetStore must be coordinated by the platform, which must keep a single
 * active controller per store.
 *
 * Pure logic: no network, phone, or native code. Step results are untrusted at runtime, so any
 * result that is not a known outcome is recorded as FAILED.
 */

export const RESET_STEPS = [
  "LOCK_LOCAL_CREDENTIALS",
  "ERASE_LOCAL_DATA",
  "DELETE_BACKUPS",
  "REVOKE_REMOTE",
  "VERIFY_ERASED",
] as const;

export type ResetStep = (typeof RESET_STEPS)[number];

export type StepOutcome = "DONE" | "FAILED" | "OFFLINE";

export type ResetStatus = "IDLE" | "IN_PROGRESS" | "WAITING_FOR_NETWORK" | "FAILED" | "COMPLETE";

/** The platform adapter's implementation of each step. Must be idempotent. Its result is untrusted. */
export type StepRunner = (step: ResetStep, resetId: string) => Promise<unknown>;

/**
 * Trusted authorization policy supplied by the platform. It must return true only when the
 * authorization value proves owner authority for this reset id. Anything else is refused, and a
 * throw is treated as refusal.
 */
export type ResetAuthorizationPolicy = (
  resetId: string,
  authorization: unknown,
) => Promise<unknown>;

export interface ResetState {
  readonly resetId: string;
  readonly status: ResetStatus;
  /** Index into RESET_STEPS of the next step to run. */
  readonly nextStep: number;
  readonly failedStep: ResetStep | null;
  readonly audit: readonly ResetAuditEntry[];
}

export interface ResetAuditEntry {
  readonly step: ResetStep;
  readonly outcome: StepOutcome;
}

export interface ResetStore {
  load(): Promise<ResetState | null>;
  /** Atomically saves the state. On failure it must leave the stored state unchanged. */
  save(state: ResetState): Promise<void>;
}

export interface StartRequest {
  readonly resetId: string;
  readonly confirmed: unknown;
  readonly authorization: unknown;
}

export type StartResult =
  | { readonly status: "STARTED"; readonly resetId: string }
  | {
      readonly status: "REFUSED";
      readonly reason: "NOT_CONFIRMED" | "NOT_AUTHORIZED" | "IN_PROGRESS" | "BAD_ID";
    };

export type ResetErrorCode = "RESET_CORRUPT";

export class ResetError extends Error {
  constructor(
    readonly code: ResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResetError";
  }
}

const MAX_AUDIT = 64;
const OUTCOMES: readonly StepOutcome[] = ["DONE", "FAILED", "OFFLINE"];
const STATUSES: readonly ResetStatus[] = [
  "IDLE",
  "IN_PROGRESS",
  "WAITING_FOR_NETWORK",
  "FAILED",
  "COMPLETE",
];

function isStep(value: unknown): value is ResetStep {
  return typeof value === "string" && (RESET_STEPS as readonly string[]).includes(value);
}

function isOutcome(value: unknown): value is StepOutcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is ResetStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** Reads a runtime-typed step result. Anything that is not a known outcome is a failure. */
function classify(raw: unknown): StepOutcome {
  return isOutcome(raw) ? raw : "FAILED";
}

function validState(value: unknown): value is ResetState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s["resetId"] === "string" &&
    s["resetId"] !== "" &&
    isStatus(s["status"]) &&
    Number.isInteger(s["nextStep"]) &&
    (s["nextStep"] as number) >= 0 &&
    (s["nextStep"] as number) <= RESET_STEPS.length &&
    (s["failedStep"] === null || isStep(s["failedStep"])) &&
    Array.isArray(s["audit"]) &&
    (s["audit"] as unknown[]).every((e) => {
      if (typeof e !== "object" || e === null) return false;
      const entry = e as Record<string, unknown>;
      return isStep(entry["step"]) && isOutcome(entry["outcome"]);
    }) &&
    // A COMPLETE reset must have finished every step.
    (s["status"] !== "COMPLETE" || s["nextStep"] === RESET_STEPS.length)
  );
}

export class FactoryReset {
  private state: ResetState;
  /** Serializes advance calls so one instance never runs two steps at once. */
  private chain: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly store: ResetStore,
    private readonly run: StepRunner,
    state: ResetState,
  ) {
    this.state = state;
  }

  /**
   * Starts a reset. Refused unless `confirmed` is exactly true, the trusted policy accepts the
   * authorization for this reset id, and no other reset is in progress. Nothing runs until
   * `advance` is called.
   */
  static async start(
    store: ResetStore,
    run: StepRunner,
    authorize: ResetAuthorizationPolicy,
    request: StartRequest,
  ): Promise<{ readonly result: StartResult; readonly reset: FactoryReset | null }> {
    if (typeof request.resetId !== "string" || request.resetId === "") {
      return { result: { status: "REFUSED", reason: "BAD_ID" }, reset: null };
    }
    if (request.confirmed !== true) {
      return { result: { status: "REFUSED", reason: "NOT_CONFIRMED" }, reset: null };
    }
    // Confirmation is not authorization. The trusted policy must accept this exact value.
    let authorized: unknown;
    try {
      authorized = await authorize(request.resetId, request.authorization);
    } catch {
      authorized = false;
    }
    if (authorized !== true) {
      return { result: { status: "REFUSED", reason: "NOT_AUTHORIZED" }, reset: null };
    }
    const existing = await store.load();
    if (existing !== null && !validState(existing)) {
      throw new ResetError("RESET_CORRUPT", "saved reset state is invalid");
    }
    if (
      existing !== null &&
      existing.status !== "COMPLETE" &&
      existing.resetId !== request.resetId
    ) {
      return { result: { status: "REFUSED", reason: "IN_PROGRESS" }, reset: null };
    }
    if (existing !== null && existing.status !== "COMPLETE") {
      // Same reset requested again: continue it rather than starting a new one.
      return {
        result: { status: "STARTED", resetId: request.resetId },
        reset: new FactoryReset(store, run, existing),
      };
    }
    const state: ResetState = {
      resetId: request.resetId,
      status: "IN_PROGRESS",
      nextStep: 0,
      failedStep: null,
      audit: [],
    };
    await store.save(state);
    return {
      result: { status: "STARTED", resetId: request.resetId },
      reset: new FactoryReset(store, run, state),
    };
  }

  /** Loads a saved reset to resume it after a restart. Corrupt state fails closed. */
  static async resume(store: ResetStore, run: StepRunner): Promise<FactoryReset | null> {
    const saved = await store.load();
    if (saved === null) return null;
    if (!validState(saved)) {
      throw new ResetError("RESET_CORRUPT", "saved reset state is invalid");
    }
    if (saved.status === "COMPLETE") return null;
    return new FactoryReset(store, run, saved);
  }

  get snapshot(): ResetState {
    return { ...this.state, audit: this.state.audit.map((e) => ({ ...e })) };
  }

  /** Runs one advance at a time, even when callers invoke it concurrently. */
  advance(): Promise<ResetStatus> {
    const next = this.chain.then(
      () => this.advanceOnce(),
      () => this.advanceOnce(),
    );
    this.chain = next.catch(() => undefined);
    return next;
  }

  /**
   * Runs steps from the first unfinished one. Stops at the first failure or offline step, and
   * saves progress after every step. A failed save leaves the step to be retried, not assumed done.
   */
  private async advanceOnce(): Promise<ResetStatus> {
    // A FAILED or WAITING reset is retried from the failed step; only COMPLETE is final.
    if (this.state.status === "COMPLETE") {
      return this.state.status;
    }
    while (this.state.nextStep < RESET_STEPS.length) {
      const step = RESET_STEPS[this.state.nextStep];
      if (step === undefined) break;
      let outcome: StepOutcome;
      try {
        outcome = classify(await this.run(step, this.state.resetId));
      } catch {
        outcome = "FAILED";
      }
      const audit = [...this.state.audit, { step, outcome }].slice(-MAX_AUDIT);
      const next: ResetState =
        outcome === "DONE"
          ? {
              ...this.state,
              nextStep: this.state.nextStep + 1,
              failedStep: null,
              status: "IN_PROGRESS",
              audit,
            }
          : {
              ...this.state,
              failedStep: step,
              status: outcome === "OFFLINE" ? "WAITING_FOR_NETWORK" : "FAILED",
              audit,
            };
      try {
        await this.store.save(next);
      } catch {
        // The step ran but its progress was not saved. Leave the saved state unchanged, so the
        // step is retried on the next attempt rather than assumed done.
        return this.state.status;
      }
      this.state = next;
      if (outcome !== "DONE") return this.state.status;
    }
    // All steps done, including verification.
    const complete: ResetState = { ...this.state, status: "COMPLETE", failedStep: null };
    try {
      await this.store.save(complete);
    } catch {
      return this.state.status;
    }
    this.state = complete;
    return "COMPLETE";
  }
}
