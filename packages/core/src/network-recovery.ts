/**
 * Network loss recovery and automatic reconnection (checklist B19).
 *
 * The platform reports whether the network is up (`reportNetwork`). This module decides when to
 * reconnect: it waits for a stability window after the network returns, backs off exponentially
 * with bounded jitter while attempts fail, retries at once when the network returns, and calls
 * `onConnected` after each successful connect, which is the trigger for synchronization.
 *
 * Pure logic. It imports no network, phone, or native code. Timers and randomness are injected,
 * so tests are deterministic. Physical Wi-Fi or cellular behaviour is not tested here (BLK-001).
 */

export interface Scheduler {
  /** Runs `task` after `delayMs`. Returns a function that cancels it. */
  setTimer(task: () => void, delayMs: number): () => void;
}

export interface ReconnectPolicy {
  readonly baseDelayMs: number;
  readonly factor: number;
  readonly maxDelayMs: number;
  /** Maximum extra delay as a fraction of the computed delay, applied before the cap. 0 to 1. */
  readonly jitterRatio: number;
  /** Failed attempts before giving up. null means keep trying. */
  readonly maxAttempts: number | null;
}

export interface NetworkRecoveryOptions {
  /** Makes one connection attempt. Must reject on failure and stop when the signal aborts. */
  readonly connect: (signal: AbortSignal) => Promise<void>;
  /** Called after each successful connect. Use it to start synchronization. */
  readonly onConnected: () => void;
  readonly scheduler: Scheduler;
  /** Returns a number in [0, 1). Defaults to Math.random. Injected for tests. */
  readonly random?: () => number;
  readonly policy?: Partial<ReconnectPolicy>;
  /** How long the network must stay up before an attempt starts. */
  readonly stableOnlineMs?: number;
}

export type RecoveryState =
  "IDLE" | "OFFLINE" | "RECONNECTING" | "CONNECTED" | "GAVE_UP" | "STOPPED";

export interface RecoverySnapshot {
  readonly state: RecoveryState;
  readonly online: boolean;
  readonly failures: number;
}

const DEFAULT_POLICY: ReconnectPolicy = {
  baseDelayMs: 1_000,
  factor: 2,
  maxDelayMs: 60_000,
  jitterRatio: 0.2,
  maxAttempts: null,
};
const DEFAULT_STABLE_ONLINE_MS = 3_000;

export class NetworkRecovery {
  private state: RecoveryState = "IDLE";
  private online = false;
  private failures = 0;
  /** Bumped on every attempt and on stop, so late results from old attempts are ignored. */
  private generation = 0;
  private inFlight: AbortController | null = null;
  /** True from the start of a connect until its promise settles. */
  private busy = false;
  private cancelBackoff: (() => void) | null = null;
  private cancelStability: (() => void) | null = null;
  private readonly policy: ReconnectPolicy;
  private readonly stableOnlineMs: number;
  private readonly random: () => number;

  constructor(private readonly options: NetworkRecoveryOptions) {
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.stableOnlineMs = options.stableOnlineMs ?? DEFAULT_STABLE_ONLINE_MS;
    this.random = options.random ?? Math.random;
  }

  get snapshot(): RecoverySnapshot {
    return { state: this.state, online: this.online, failures: this.failures };
  }

  /** Starts with the current network state. Online begins the stability window, offline waits. */
  start(initiallyOnline: boolean): void {
    if (this.state !== "IDLE" && this.state !== "STOPPED") return;
    this.state = "OFFLINE";
    this.reportNetwork(initiallyOnline);
  }

  /** Called by the platform layer whenever network availability changes. Repeats are ignored. */
  reportNetwork(online: boolean): void {
    if (this.state === "STOPPED" || online === this.online) return;
    this.online = online;
    if (!online) {
      this.cancelPending();
      this.abortInFlight();
      if (this.state !== "GAVE_UP") this.state = "OFFLINE";
      return;
    }
    if (this.state === "CONNECTED" || this.state === "GAVE_UP") return;
    this.cancelStability?.();
    this.cancelStability = this.options.scheduler.setTimer(() => {
      this.cancelStability = null;
      if (this.online && this.state !== "STOPPED") {
        // The network returned: reset backoff and retry at once.
        this.cancelPending();
        this.failures = 0;
        this.attempt();
      }
    }, this.stableOnlineMs);
  }

  /** Clears GAVE_UP and tries again now, if the network is up. */
  retryNow(): void {
    if (this.state !== "GAVE_UP" || !this.online) return;
    this.failures = 0;
    this.state = "OFFLINE";
    this.attempt();
  }

  /** Stops everything: timers cancelled, in-flight attempt aborted, late results ignored. */
  stop(): void {
    this.state = "STOPPED";
    this.generation += 1;
    this.cancelPending();
    this.abortInFlight();
  }

  private attempt(): void {
    // `busy` stays set until the connect promise itself settles, even after an abort, so two
    // connects never overlap. A connect that ignores its signal keeps the slot occupied.
    if (this.state === "STOPPED" || !this.online || this.busy) return;
    this.state = "RECONNECTING";
    this.generation += 1;
    const gen = this.generation;
    const controller = new AbortController();
    this.inFlight = controller;
    this.busy = true;

    let pending: Promise<void>;
    try {
      pending = Promise.resolve(this.options.connect(controller.signal));
    } catch (error: unknown) {
      pending = Promise.reject(error instanceof Error ? error : new Error("connect threw"));
    }
    const settle = (ok: boolean): void => {
      this.busy = false;
      if (gen !== this.generation) {
        // Stale result from an attempt that was interrupted or stopped.
        if (this.state !== "STOPPED" && this.online && this.state !== "CONNECTED") {
          this.attempt();
        }
        return;
      }
      this.inFlight = null;
      if (this.state === "STOPPED") return;
      if (controller.signal.aborted || !this.online) {
        // Interrupted by the network going away: not a failed attempt, not connected. If the
        // network came back while this connect was still pending, retry now that the slot is free.
        if (this.online) this.attempt();
        return;
      }
      if (ok) {
        this.failures = 0;
        this.state = "CONNECTED";
        this.options.onConnected();
        return;
      }
      this.failures += 1;
      if (this.policy.maxAttempts !== null && this.failures >= this.policy.maxAttempts) {
        this.state = "GAVE_UP";
        return;
      }
      this.state = "OFFLINE";
      this.scheduleBackoff();
    };
    pending.then(
      () => {
        settle(true);
      },
      () => {
        settle(false);
      },
    );
  }

  private scheduleBackoff(): void {
    this.cancelPending();
    const delay = this.backoffMs(this.failures);
    this.cancelBackoff = this.options.scheduler.setTimer(() => {
      this.cancelBackoff = null;
      this.attempt();
    }, delay);
  }

  /** Delay after `failures` failed attempts: base * factor^(failures-1), with jitter, then capped. */
  backoffMs(failures: number): number {
    const raw = this.policy.baseDelayMs * this.policy.factor ** Math.max(0, failures - 1);
    const jitter = raw * this.policy.jitterRatio * this.random();
    return Math.min(this.policy.maxDelayMs, Math.round(raw + jitter));
  }

  private cancelPending(): void {
    this.cancelBackoff?.();
    this.cancelBackoff = null;
    this.cancelStability?.();
    this.cancelStability = null;
  }

  private abortInFlight(): void {
    this.inFlight?.abort();
    this.inFlight = null;
  }
}
