/**
 * Detecting visual scene changes (checklist C10).
 *
 * Each frame is analysed in a fresh C02 analysis session from an injected factory, so authorization, disclosure,
 * spend limits, sampling and cancellation are the C02 guarantees. The provider's scene summary is untrusted at
 * runtime and is reduced to a bounded list of labels. The detector compares it with the previous summary. It keeps
 * only that last summary, never the frame, and it refuses frames that are not later than the stored one. A change
 * is reported as the labels differ, with explicit uncertainty. No physical motion is claimed. Nothing runs in the
 * background.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export type ChangeState = "BASELINE" | "UNCHANGED" | "CHANGED" | "AMBIGUOUS" | "INSUFFICIENT";

export interface SceneLabel {
  readonly label: string;
  readonly confidence: number;
  readonly certainty: "HIGH" | "LOW";
}

export interface SceneSummary {
  readonly labels: readonly SceneLabel[];
  readonly atMs: number;
}

export interface SceneChange {
  readonly state: ChangeState;
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** One C02 analysis session, as used here. */
export interface SceneChangeAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface SceneChangeDetectorOptions {
  /** Creates one C02 analysis session per frame. */
  readonly createAnalysis: () => SceneChangeAnalysis;
}

export type SceneChangeRefusal =
  | "BAD_INPUT"
  | "BUSY"
  | "CANCELLED"
  | "OUT_OF_ORDER"
  | "MALFORMED_RESPONSE"
  | "STAGE_FAILED"
  | FrameAnalysisRefusal;

export type DetectResult =
  | { readonly status: "OK"; readonly change: SceneChange; readonly summary: SceneSummary }
  | { readonly status: "REFUSED"; readonly reason: SceneChangeRefusal };

const MAX_RESPONSE_CHARS = 8192;
const MAX_LABELS = 20;
const MAX_LABEL_CHARS = 80;
const LOW_CONFIDENCE = 0.5;

/** Every refusal code the C02 analysis session can return. Checked at runtime. */
const FRAME_ANALYSIS_REFUSALS: readonly FrameAnalysisRefusal[] = [
  "BAD_INPUT",
  "NOT_AUTHORIZED",
  "OVERSIZE",
  "BUSY",
  "SAMPLED_OUT",
  "LIMIT_REACHED",
  "CANCELLED",
  "DISCLOSURE_REQUIRED",
  "CAP_REACHED",
  "QUOTA_EXCEEDED",
  "UNAUTHORIZED",
  "INVALID_AMOUNT",
  "CIRCUIT_OPEN",
  "TIMEOUT",
  "PROVIDER_ERROR",
];

export class SceneChangeError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "SceneChangeError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFrameAnalysisRefusal(value: unknown): value is FrameAnalysisRefusal {
  return typeof value === "string" && FRAME_ANALYSIS_REFUSALS.some((code) => code === value);
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Parses the provider's scene summary. Returns null when it does not match the contract. */
export function parseLabels(raw: unknown): SceneLabel[] | null {
  // Untrusted at runtime: anything that is not a string is a malformed response.
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_RESPONSE_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_LABELS) return null;
  const labels: SceneLabel[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const label = record["label"];
    const confidence = record["confidence"];
    if (typeof label !== "string" || label.length === 0 || label.length > MAX_LABEL_CHARS)
      return null;
    if (hasControlCharacter(label)) return null;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    )
      return null;
    labels.push({ label, confidence, certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH" });
  }
  return labels;
}

/**
 * Compares two label sets. Identical sets are UNCHANGED. Labels that are all different are CHANGED. A partial
 * overlap is AMBIGUOUS. A change that rests only on low-confidence labels is AMBIGUOUS, never CHANGED.
 */
export function compareLabels(
  previous: readonly SceneLabel[],
  current: readonly SceneLabel[],
): SceneChange {
  if (current.length === 0) return { state: "INSUFFICIENT", added: [], removed: [] };
  const previousSet = new Set(previous.map((l) => l.label));
  const currentSet = new Set(current.map((l) => l.label));
  const added = current.filter((l) => !previousSet.has(l.label)).map((l) => l.label);
  const removed = previous.filter((l) => !currentSet.has(l.label)).map((l) => l.label);
  if (added.length === 0 && removed.length === 0) return { state: "UNCHANGED", added, removed };
  const shared = current.filter((l) => previousSet.has(l.label)).length;
  // A change counts as CHANGED only when no label is shared and the new labels are all confident.
  const allConfident =
    current.every((l) => l.certainty === "HIGH") && previous.every((l) => l.certainty === "HIGH");
  if (shared === 0 && allConfident) return { state: "CHANGED", added, removed };
  return { state: "AMBIGUOUS", added, removed };
}

export class SceneChangeDetector {
  private readonly createAnalysis: () => SceneChangeAnalysis;
  private currentAnalysis: SceneChangeAnalysis | null = null;
  /** Only the last accepted summary is kept. No frame is kept. */
  private previous: SceneSummary | null = null;
  /** True from the start of a frame until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: SceneChangeDetectorOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new SceneChangeError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    this.createAnalysis = options.createAnalysis;
  }

  /** True while a frame is being analysed. */
  get analysing(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Analyses a frame and reports how the scene changed since the previous accepted frame. */
  async detect(frame: Uint8Array, atMs: number): Promise<DetectResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };
    // Temporal order is checked before any analysis, so a frame that cannot be used spends no analysis budget.
    if (this.previous !== null && atMs <= this.previous.atMs)
      return { status: "REFUSED", reason: "OUT_OF_ORDER" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: SceneChangeAnalysis;
      try {
        analysis = this.createAnalysis();
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      this.currentAnalysis = analysis;
      let result: unknown;
      try {
        result = await analysis.analyze(frame, atMs);
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");

      // The envelope is untrusted at runtime: only a recognised OK or REFUSED envelope is accepted.
      if (typeof result !== "object" || result === null) return this.refuse("MALFORMED_RESPONSE");
      const record = result as { status?: unknown; reason?: unknown; value?: unknown };
      if (record.status === "REFUSED") {
        return this.refuse(
          isFrameAnalysisRefusal(record.reason) ? record.reason : "MALFORMED_RESPONSE",
        );
      }
      if (record.status !== "OK") return this.refuse("MALFORMED_RESPONSE");

      const labels = parseLabels(record.value);
      if (labels === null) return this.refuse("MALFORMED_RESPONSE");

      // Temporal order: a frame not later than the stored one is refused and never replaces it.
      if (this.previous !== null && atMs <= this.previous.atMs) return this.refuse("OUT_OF_ORDER");

      const change: SceneChange =
        this.previous === null
          ? { state: "BASELINE", added: [], removed: [] }
          : compareLabels(this.previous.labels, labels);
      const summary: SceneSummary = { labels, atMs };
      this.previous = summary;
      return { status: "OK", change, summary };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: SceneChangeRefusal): DetectResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the frame in progress, if any. Its result is discarded and the stored summary is not replaced. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}
