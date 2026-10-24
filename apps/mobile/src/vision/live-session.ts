/**
 * User-controlled live vision, foundation only: periodic single-frame analysis with bounded interval, length, frames and
 * spending. This is NOT continuous video understanding. Each analysed frame is one still image sent as one request.
 *
 * The controller has no UI and no provider code. Capture, analysis and timers are injected, so it runs in tests with mock
 * frames and mock answers. Nothing starts without an explicit start() call, and nothing runs in the background: the
 * screen is expected to call dispose() when it leaves.
 */
import { checkImage } from "../see/session";

/** Shortest allowed gap between frames. Shorter intervals are refused rather than clamped. */
export const MIN_INTERVAL_MS = 3000;
/** A session ends by itself after this long. */
export const MAX_SESSION_MS = 120_000;
/** At most this many frames are analysed in one session. */
export const MAX_FRAMES = 40;
/** Spending limit per session, in paise (100 paise = ₹1). */
export const SESSION_BUDGET_PAISE = 200;
/** Worst-case cost assumed for one analysis before it runs. Conservative on purpose. */
const DEFAULT_WORST_CASE_PAISE = 25;

type LiveSource = "mock" | "openrouter";

export interface LiveAnswer {
  readonly text: string;
  readonly source: LiveSource;
  readonly costPaise: number;
}

export interface LiveVisionDeps {
  /** Returns one frame as a JPEG or PNG data URL, or null when the camera has no frame. */
  captureFrame(): Promise<string | null>;
  /** Analyses one frame. Must reject with the signal's reason when aborted. */
  analyse(frame: string, question: string, signal: AbortSignal): Promise<LiveAnswer>;
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface LiveOptions {
  readonly intervalMs: number;
  readonly question: string;
  readonly maxSessionMs?: number;
  readonly maxFrames?: number;
  readonly budgetPaise?: number;
  /** Cost assumed for the next analysis when checking the budget. */
  readonly worstCasePaise?: number;
}

export type LivePhase = "idle" | "running" | "stopped" | "budget_reached" | "timed_out" | "error";

export interface LiveState {
  readonly phase: LivePhase;
  readonly answer: LiveAnswer | null;
  /** Source of the last answer, so the screen can show MOCK or live. */
  readonly source: LiveSource | null;
  readonly framesAnalysed: number;
  readonly ticksSkipped: number;
  readonly invalidFrames: number;
  readonly spentPaise: number;
  readonly message: string | null;
}

const INITIAL: LiveState = {
  phase: "idle",
  answer: null,
  source: null,
  framesAnalysed: 0,
  ticksSkipped: 0,
  invalidFrames: 0,
  spentPaise: 0,
  message: null,
};

export class LiveVisionSession {
  private current: LiveState = INITIAL;
  private readonly listeners = new Set<(state: LiveState) => void>();
  private timer: unknown = null;
  private controller: AbortController | null = null;
  private inFlight = false;
  private generation = 0;
  private disposed = false;
  private options: (Required<Omit<LiveOptions, "question">> & { question: string }) | null = null;
  private sessionTimer: unknown = null;

  constructor(private readonly deps: LiveVisionDeps) {}

  get state(): LiveState {
    return this.current;
  }

  subscribe(listener: (state: LiveState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Starts a session. Throws RangeError when the interval is below the minimum or the options are out of range. */
  start(options: LiveOptions): void {
    if (this.disposed) {
      throw new Error("SESSION_DISPOSED");
    }
    if (this.current.phase === "running") {
      throw new Error("SESSION_ALREADY_RUNNING");
    }
    if (!Number.isFinite(options.intervalMs) || options.intervalMs < MIN_INTERVAL_MS) {
      throw new RangeError("INTERVAL_TOO_SHORT");
    }
    const maxSessionMs = options.maxSessionMs ?? MAX_SESSION_MS;
    const maxFrames = options.maxFrames ?? MAX_FRAMES;
    const budgetPaise = options.budgetPaise ?? SESSION_BUDGET_PAISE;
    if (maxSessionMs <= 0 || maxSessionMs > MAX_SESSION_MS || maxFrames < 1 || budgetPaise < 0) {
      throw new RangeError("SESSION_LIMITS_OUT_OF_RANGE");
    }
    this.options = {
      intervalMs: options.intervalMs,
      question: options.question,
      maxSessionMs,
      maxFrames,
      budgetPaise,
      worstCasePaise: options.worstCasePaise ?? DEFAULT_WORST_CASE_PAISE,
    };
    this.current = { ...INITIAL, phase: "running" };
    this.emit();
    this.sessionTimer = this.deps.setTimer(
      () => this.end("timed_out", "Live vision stopped after the time limit."),
      maxSessionMs,
    );
    this.scheduleTick();
  }

  /** Stops the session now. Cancels any analysis in flight; its result is dropped. */
  stop(): void {
    if (this.current.phase !== "running") {
      return;
    }
    this.end("stopped", null);
  }

  /** Always cancels everything. The controller cannot be started again afterwards. */
  dispose(): void {
    this.disposed = true;
    this.clearAll();
    this.listeners.clear();
  }

  private scheduleTick(): void {
    if (this.current.phase !== "running" || this.options === null) {
      return;
    }
    this.timer = this.deps.setTimer(() => this.tick(), this.options.intervalMs);
  }

  /** Every interval: skip if busy, otherwise capture and analyse one frame. */
  private tick(): void {
    this.timer = null;
    if (this.current.phase !== "running" || this.options === null) {
      return;
    }
    if (this.inFlight) {
      this.set({ ticksSkipped: this.current.ticksSkipped + 1 });
      this.scheduleTick();
      return;
    }
    if (this.current.framesAnalysed >= this.options.maxFrames) {
      this.end("stopped", "Frame limit reached for this session.");
      return;
    }
    if (this.current.spentPaise + this.options.worstCasePaise > this.options.budgetPaise) {
      this.end("budget_reached", "Spending limit for this session reached.");
      return;
    }
    this.scheduleTick();
    this.analyseOnce();
  }

  private analyseOnce(): void {
    const gen = this.generation;
    this.inFlight = true;
    const controller = new AbortController();
    this.controller = controller;
    const finishRun = () => {
      if (gen === this.generation) {
        this.inFlight = false;
        this.controller = null;
      }
    };
    this.deps
      .captureFrame()
      .then((frame) => {
        if (gen !== this.generation || controller.signal.aborted) {
          return undefined;
        }
        const check = checkImage(frame);
        if (!check.ok) {
          this.set({ invalidFrames: this.current.invalidFrames + 1 });
          return undefined;
        }
        return this.deps.analyse(frame as string, this.options?.question ?? "", controller.signal);
      })
      .then((answer) => {
        if (answer === undefined || gen !== this.generation || controller.signal.aborted) {
          return;
        }
        this.set({
          answer,
          source: answer.source,
          framesAnalysed: this.current.framesAnalysed + 1,
          spentPaise: this.current.spentPaise + answer.costPaise,
        });
      })
      .catch((error: unknown) => {
        if (gen !== this.generation || controller.signal.aborted) {
          return;
        }
        this.end(
          "error",
          error instanceof Error ? "Live analysis failed. Try again." : "Live analysis failed.",
        );
      })
      .finally(finishRun);
  }

  /** Ends the session: stops timers, cancels the analysis in flight and invalidates its result. */
  private end(phase: LivePhase, message: string | null): void {
    this.clearAll();
    this.set({ phase, message });
  }

  private clearAll(): void {
    this.generation += 1;
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.sessionTimer !== null) {
      this.deps.clearTimer(this.sessionTimer);
      this.sessionTimer = null;
    }
    this.controller?.abort();
    this.controller = null;
    this.inFlight = false;
  }

  private set(patch: Partial<LiveState>): void {
    this.current = { ...this.current, ...patch };
    this.listeners.forEach((fn) => fn(this.current));
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn(this.current));
  }
}
