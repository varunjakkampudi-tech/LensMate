/**
 * Recognition of everyday objects and environmental features (checklist C04).
 *
 * Each recognition runs in a fresh C02 analysis session, created by an injected factory, so authorization,
 * disclosure, spend limits, sampling and cancellation are the C02 guarantees. The provider's free text is
 * parsed as a bounded, structured list. Anything that does not match the contract is refused, and
 * low-confidence items are marked uncertain rather than presented as certain. Nothing is retained after a
 * recognition settles.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export type RecognitionKind = "OBJECT" | "ENVIRONMENT";
export type Certainty = "HIGH" | "LOW";
export type RecognitionState = "RECOGNIZED" | "AMBIGUOUS" | "EMPTY";

export interface RecognitionItem {
  readonly label: string;
  readonly kind: RecognitionKind;
  readonly confidence: number;
  readonly certainty: Certainty;
}

/** One C02 analysis session, as used here. */
export interface RecognitionAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface ObjectRecognizerOptions {
  /** Creates one C02 analysis session per recognition. */
  readonly createAnalysis: () => RecognitionAnalysis;
}

export type RecognitionRefusal =
  "BAD_INPUT" | "BUSY" | "CANCELLED" | "MALFORMED_RESPONSE" | "STAGE_FAILED" | FrameAnalysisRefusal;

export type RecognitionResult =
  | {
      readonly status: "OK";
      readonly state: RecognitionState;
      readonly items: readonly RecognitionItem[];
      readonly recognizedAtMs: number;
    }
  | { readonly status: "REFUSED"; readonly reason: RecognitionRefusal };

const MAX_RESPONSE_CHARS = 4096;
const MAX_ITEMS = 10;
const MAX_LABEL_CHARS = 80;
const LOW_CONFIDENCE = 0.5;

/** Every refusal code the C02 analysis session can return. Runtime-checked, so untrusted envelopes cannot inject codes. */
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

function isFrameAnalysisRefusal(value: unknown): value is FrameAnalysisRefusal {
  return typeof value === "string" && FRAME_ANALYSIS_REFUSALS.some((code) => code === value);
}

export class ObjectRecognizerError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "ObjectRecognizerError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Parses the provider's text against the recognition contract. Returns null when it does not match. */
export function parseRecognition(raw: unknown): RecognitionItem[] | null {
  // Provider output is untrusted at runtime: anything that is not a string is a malformed response.
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_RESPONSE_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_ITEMS) return null;
  const items: RecognitionItem[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const label = record["label"];
    const kind = record["kind"];
    const confidence = record["confidence"];
    if (typeof label !== "string" || label.length === 0 || label.length > MAX_LABEL_CHARS)
      return null;
    // Control characters are not allowed in labels.
    if (hasControlCharacter(label)) return null;
    if (kind !== "OBJECT" && kind !== "ENVIRONMENT") return null;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    items.push({
      label,
      kind,
      confidence,
      certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH",
    });
  }
  return items;
}

export class ObjectRecognizer {
  private readonly createAnalysis: () => RecognitionAnalysis;
  private currentAnalysis: RecognitionAnalysis | null = null;
  /** True from the start of a recognition until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: ObjectRecognizerOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new ObjectRecognizerError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    this.createAnalysis = options.createAnalysis;
  }

  /** True while a recognition is in progress. */
  get recognizing(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Recognises objects and environmental features in one frame. */
  async recognize(frame: Uint8Array, atMs: number): Promise<RecognitionResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: RecognitionAnalysis;
      try {
        analysis = this.createAnalysis();
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      this.currentAnalysis = analysis;
      let result: Awaited<ReturnType<RecognitionAnalysis["analyze"]>>;
      try {
        result = await analysis.analyze(frame, atMs);
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");
      // The envelope is untrusted at runtime: anything that is not a recognised OK or REFUSED envelope is malformed.
      const envelope: unknown = result;
      if (typeof envelope !== "object" || envelope === null)
        return this.refuse("MALFORMED_RESPONSE");
      const record = envelope as { status?: unknown; reason?: unknown; value?: unknown };
      if (record.status === "REFUSED") {
        // A refusal reason is kept only when it is a real C02 refusal code; anything else is malformed.
        return this.refuse(
          isFrameAnalysisRefusal(record.reason) ? record.reason : "MALFORMED_RESPONSE",
        );
      }
      if (record.status !== "OK") return this.refuse("MALFORMED_RESPONSE");

      const items = parseRecognition(record.value);
      if (items === null) return this.refuse("MALFORMED_RESPONSE");
      return {
        status: "OK",
        state: stateOf(items),
        items,
        recognizedAtMs: atMs,
      };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: RecognitionRefusal): RecognitionResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the recognition in progress, if any. Its provider result is discarded. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}

function stateOf(items: readonly RecognitionItem[]): RecognitionState {
  if (items.length === 0) return "EMPTY";
  return items.every((item) => item.certainty === "LOW") ? "AMBIGUOUS" : "RECOGNIZED";
}
