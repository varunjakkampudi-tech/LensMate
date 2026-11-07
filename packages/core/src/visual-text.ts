/**
 * Reading signs, books, receipts and labels (checklist C06).
 *
 * Each read runs in a fresh C02 analysis session from an injected factory, so authorization, disclosure,
 * spend limits, sampling and cancellation are the C02 guarantees. The provider's output is untrusted at
 * runtime. A reading keeps the provider's reading order and reports each region's basis, so extracted text
 * is never presented as interpretation, and interpreted text is never presented as extracted. Nothing is
 * retained after a read settles.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export const DOCUMENT_CATEGORIES = ["SIGN", "BOOK", "RECEIPT", "LABEL", "OTHER"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type Basis = "EXTRACTED" | "INTERPRETED";
export type ReadingState = "COMPLETE" | "PARTIAL" | "AMBIGUOUS" | "EMPTY";

export interface TextRegion {
  readonly order: number;
  readonly text: string;
  readonly basis: Basis;
  readonly confidence: number;
  readonly certainty: "HIGH" | "LOW";
}

/** One C02 analysis session, as used here. */
export interface TextAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface TextReaderOptions {
  /** Creates one C02 analysis session per read. */
  readonly createAnalysis: () => TextAnalysis;
}

export type TextRefusal =
  "BAD_INPUT" | "BUSY" | "CANCELLED" | "MALFORMED_RESPONSE" | "STAGE_FAILED" | FrameAnalysisRefusal;

export type ReadResult =
  | {
      readonly status: "OK";
      readonly state: ReadingState;
      readonly category: DocumentCategory;
      readonly regions: readonly TextRegion[];
      readonly readAtMs: number;
    }
  | { readonly status: "REFUSED"; readonly reason: TextRefusal };

const MAX_RESPONSE_CHARS = 8192;
const MAX_REGIONS = 20;
const MAX_REGION_CHARS = 300;
const MAX_TOTAL_CHARS = 2000;
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

export class TextReaderError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "TextReaderError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFrameAnalysisRefusal(value: unknown): value is FrameAnalysisRefusal {
  return typeof value === "string" && FRAME_ANALYSIS_REFUSALS.some((code) => code === value);
}

/** Control characters are refused, except line breaks, which multiline text needs. */
function hasDisallowedControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isLineBreak = code === 10 || code === 13;
    if ((code < 32 && !isLineBreak) || code === 127) return true;
  }
  return false;
}

function isCategory(value: unknown): value is DocumentCategory {
  return typeof value === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Parses the provider's text against the reading contract. Returns null when it does not match. Regions keep
 * the provider's order, and a list whose orders are repeated, skipped or out of range is refused.
 */
export function parseReading(
  raw: unknown,
): { category: DocumentCategory; regions: TextRegion[]; partial: boolean } | null {
  // Untrusted at runtime: anything that is not a string is a malformed response.
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_RESPONSE_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const reading = parsed as Record<string, unknown>;
  const category = reading["category"];
  const partial = reading["partial"];
  const regionList = reading["regions"];
  if (!isCategory(category) || typeof partial !== "boolean" || !Array.isArray(regionList))
    return null;
  if (regionList.length > MAX_REGIONS) return null;

  const regions: TextRegion[] = [];
  let totalChars = 0;
  for (const entry of regionList) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const order = record["order"];
    const text = record["text"];
    const basis = record["basis"];
    const confidence = record["confidence"];
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_REGION_CHARS)
      return null;
    if (hasDisallowedControl(text)) return null;
    totalChars += text.length;
    if (totalChars > MAX_TOTAL_CHARS) return null;
    if (basis !== "EXTRACTED" && basis !== "INTERPRETED") return null;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    if (!Number.isInteger(order)) return null;
    regions.push({
      order: order as number,
      text,
      basis,
      confidence,
      certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH",
    });
  }

  // Reading order must be exactly 0..n-1 in the order given: no repeats, no gaps, no reordering.
  for (let i = 0; i < regions.length; i += 1) {
    if (regions[i]?.order !== i) return null;
  }
  return { category, regions, partial };
}

function stateOf(regions: readonly TextRegion[], partial: boolean): ReadingState {
  if (regions.length === 0) return "EMPTY";
  if (partial) return "PARTIAL";
  if (regions.every((region) => region.certainty === "LOW")) return "AMBIGUOUS";
  return "COMPLETE";
}

export class TextReader {
  private readonly createAnalysis: () => TextAnalysis;
  private currentAnalysis: TextAnalysis | null = null;
  /** True from the start of a read until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: TextReaderOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new TextReaderError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    this.createAnalysis = options.createAnalysis;
  }

  /** True while a read is in progress. */
  get reading(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Reads the visible text in one frame, in reading order. */
  async read(frame: Uint8Array, atMs: number): Promise<ReadResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: TextAnalysis;
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

      const reading = parseReading(record.value);
      if (reading === null) return this.refuse("MALFORMED_RESPONSE");
      return {
        status: "OK",
        state: stateOf(reading.regions, reading.partial),
        category: reading.category,
        regions: reading.regions,
        readAtMs: atMs,
      };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: TextRefusal): ReadResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the read in progress, if any. Its provider result is discarded. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}
