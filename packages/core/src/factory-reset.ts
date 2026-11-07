/**
 * Factory reset and secure data erasure (checklist B22).
 *
 * A reset runs a fixed, ordered list of steps supplied by the platform adapter. Progress is saved
 * after every step, so a restart resumes at the first unfinished step. The reset reports COMPLETE
 * only after the verification step confirms erasure and remote revocation has succeeded. A failed
 * or offline step is never reported as complete.
 *
 * Pure logic: no network, phone, or native code. The platform adapter supplies each step, and the
 * controller only sequences them and records their outcomes.
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

/** The platform adapter's implementation of each step. Must be idempotent. */
export type StepRunner = (step: ResetStep, resetId: string) => Promise<StepOutcome>;

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

export type StartResult =
  | { readonly status: "STARTED"; readonly resetId: string }
  | { readonly status: "REFUSED"; readonly reason: "NOT_CONFIRMED" | "IN_PROGRESS" | "BAD_ID" };

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

function isStep(value: unknown): value is ResetStep {
  return typeof value === "string" && (RESET_STEPS as readonly string[]).includes(value);
}

function validState(value: unknown): value is ResetState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  const statuses = ["IDLE", "IN_PROGRESS", "WAITING_FOR_NETWORK", "FAILED", "COMPLETE"];
  return (
    typeof s["resetId"] === "string" &&
    s["resetId"] !== "" &&
    typeof s["status"] === "string" &&
    statuses.includes(s["status"]) &&
    Number.isInteger(s["nextStep"]) &&
    (s["nextStep"] as number) >= 0 &&
    (s["nextStep"] as number) <= RESET_STEPS.length &&
    (s["failedStep"] === null || isStep(s["failedStep"])) &&
    Array.isArray(s["audit"]) &&
    (s["audit"] as unknown[]).every((e) => {
      if (typeof e !== "object" || e === null) return false;
      const entry = e as Record<string, unknown>;
      return (
        isStep(entry["step"]) &&
        (entry["outcome"] === "DONE" ||
          entry["outcome"] === "FAILED" ||
          entry["outcome"] === "OFFLINE")
      );
    }) &&
    // A COMPLETE reset must have finished every step.
    (s["status"] !== "COMPLETE" || s["nextStep"] === RESET_STEPS.length)
  );
}

export class FactoryReset {
  private state: ResetState;

  private constructor(
    private readonly store: ResetStore,
    private readonly run: StepRunner,
    state: ResetState,
  ) {
    this.state = state;
  }

  /**
   * Starts a reset. Refused unless `confirmed` is exactly true, and refused while a different reset
   * is still in progress. Nothing runs until `advance` is called.
   */
  static async start(
    store: ResetStore,
    run: StepRunner,
    request: { readonly resetId: string; readonly confirmed: unknown },
  ): Promise<{ readonly result: StartResult; readonly reset: FactoryReset | null }> {
    if (typeof request.resetId !== "string" || request.resetId === "") {
      return { result: { status: "REFUSED", reason: "BAD_ID" }, reset: null };
    }
    if (request.confirmed !== true) {
      return { result: { status: "REFUSED", reason: "NOT_CONFIRMED" }, reset: null };
    }
    const existing = await store.load();
    if (existing !== null && !validState(existing)) {
      throw new ResetError("RESET_CORRUPT", "saved reset state is invalid");
    }
    if (
      existing !== null &&
      (existing.status === "IN_PROGRESS" ||
        existing.status === "WAITING_FOR_NETWORK" ||
        existing.status === "FAILED") &&
      existing.resetId !== request.resetId
    ) {
      return { result: { status: "REFUSED", reason: "IN_PROGRESS" }, reset: null };
    }
    if (existing !== null && existing.resetId === request.resetId) {
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

  /**
   * Runs steps from the first unfinished one. Stops at the first failure or offline step, and
   * saves progress after every step. A failed save leaves the step to be retried, not assumed done.
   */
  async advance(): Promise<ResetStatus> {
    // A FAILED or WAITING reset is retried from the failed step; only COMPLETE is final.
    if (this.state.status === "COMPLETE") {
      return this.state.status;
    }
    while (this.state.nextStep < RESET_STEPS.length) {
      const step = RESET_STEPS[this.state.nextStep];
      if (step === undefined) break;
      let outcome: StepOutcome;
      try {
        outcome = await this.run(step, this.state.resetId);
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
