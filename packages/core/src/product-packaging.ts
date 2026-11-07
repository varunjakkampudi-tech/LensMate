/**
 * Understanding product packaging and ingredients (checklist C08).
 *
 * Each read runs in a fresh C02 analysis session from an injected factory, so authorization, disclosure,
 * spend limits, sampling and cancellation are the C02 guarantees. The provider's output is untrusted at runtime.
 * Printed text and interpretation are kept in separate lists. Every interpretation is marked unverified, and an
 * allergy, safety or health statement is never reported as verified. Nothing is retained after a read settles.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export const INGREDIENT_STATES = ["COMPLETE", "PARTIAL", "UNREADABLE", "ABSENT"] as const;
export type IngredientState = (typeof INGREDIENT_STATES)[number];

export interface PrintedIngredient {
  readonly text: string;
  readonly confidence: number;
  readonly certainty: "HIGH" | "LOW";
}

export interface Interpretation {
  readonly text: string;
  readonly topic: "ALLERGEN" | "SAFETY" | "HEALTH" | "INGREDIENT" | "OTHER";
  readonly confidence: number;
  /** Always false: no interpretation is presented as verified. */
  readonly verified: false;
}

/** One C02 analysis session, as used here. */
export interface PackagingAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface PackagingReaderOptions {
  /** Creates one C02 analysis session per read. */
  readonly createAnalysis: () => PackagingAnalysis;
}

export type PackagingRefusal =
  "BAD_INPUT" | "BUSY" | "CANCELLED" | "MALFORMED_RESPONSE" | "STAGE_FAILED" | FrameAnalysisRefusal;

export type PackagingResult =
  | {
      readonly status: "OK";
      readonly productName: string | null;
      readonly ingredientsState: IngredientState;
      readonly partial: boolean;
      readonly printedIngredients: readonly PrintedIngredient[];
      readonly interpretations: readonly Interpretation[];
      readonly readAtMs: number;
    }
  | { readonly status: "REFUSED"; readonly reason: PackagingRefusal };

const MAX_RESPONSE_CHARS = 16384;
const MAX_INGREDIENTS = 60;
const MAX_INTERPRETATIONS = 20;
const MAX_NAME_CHARS = 120;
const MAX_INGREDIENT_CHARS = 80;
const MAX_TEXT_CHARS = 300;
const LOW_CONFIDENCE = 0.5;
const TOPICS = ["ALLERGEN", "SAFETY", "HEALTH", "INGREDIENT", "OTHER"] as const;

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

export class PackagingReaderError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "PackagingReaderError";
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

function isIngredientState(value: unknown): value is IngredientState {
  return typeof value === "string" && (INGREDIENT_STATES as readonly string[]).includes(value);
}

function isTopic(value: unknown): value is Interpretation["topic"] {
  return typeof value === "string" && (TOPICS as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Parses the provider's text against the packaging contract. Returns null when the shape does not match. Printed
 * ingredients are the only entries that can appear as printed; interpretations are kept in their own list.
 */
export function parsePackaging(raw: unknown): {
  productName: string | null;
  ingredientsState: IngredientState;
  partial: boolean;
  printed: PrintedIngredient[];
  interpretations: Interpretation[];
} | null {
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
  const name = reading["productName"];
  const state = reading["ingredientsState"];
  const partial = reading["partial"];
  const ingredients = reading["ingredients"];
  const claims = reading["claims"];
  if (name !== null && name !== undefined) {
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.length > MAX_NAME_CHARS ||
      hasControlCharacter(name)
    ) {
      return null;
    }
  }
  if (!isIngredientState(state) || typeof partial !== "boolean") return null;
  if (!Array.isArray(ingredients) || ingredients.length > MAX_INGREDIENTS) return null;
  if (!Array.isArray(claims) || claims.length > MAX_INTERPRETATIONS) return null;

  const printed: PrintedIngredient[] = [];
  const interpretations: Interpretation[] = [];
  for (const entry of ingredients) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const text = record["text"];
    const basis = record["basis"];
    const confidence = record["confidence"];
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_INGREDIENT_CHARS)
      return null;
    if (hasControlCharacter(text)) return null;
    if (basis !== "PRINTED" && basis !== "INTERPRETED") return null;
    if (!isConfidence(confidence)) return null;
    if (basis === "PRINTED") {
      printed.push({ text, confidence, certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH" });
    } else {
      // An interpreted ingredient is kept as an unverified interpretation, never reported as printed.
      interpretations.push({ text, topic: "INGREDIENT", confidence, verified: false });
    }
  }

  for (const entry of claims) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const text = record["text"];
    const topic = record["topic"];
    const basis = record["basis"];
    const confidence = record["confidence"];
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_CHARS) return null;
    if (hasControlCharacter(text)) return null;
    if (!isTopic(topic)) return null;
    if (basis !== "PRINTED" && basis !== "INTERPRETED") return null;
    if (!isConfidence(confidence)) return null;
    // A claim is kept only as an interpretation: it is never presented as verified, and an allergy, safety or health
    // statement is never printed, whatever its basis.
    if (basis === "PRINTED" && (topic === "ALLERGEN" || topic === "SAFETY" || topic === "HEALTH"))
      return null;
    interpretations.push({ text, topic, confidence, verified: false });
  }

  return {
    productName: typeof name === "string" ? name : null,
    ingredientsState: state,
    partial,
    printed,
    interpretations,
  };
}

function stateOf(ingredientsState: IngredientState, partial: boolean): IngredientState {
  // A partial reading is never reported as COMPLETE, whatever the ingredient state says.
  if (partial && ingredientsState === "COMPLETE") return "PARTIAL";
  return ingredientsState;
}

export class PackagingReader {
  private readonly createAnalysis: () => PackagingAnalysis;
  private currentAnalysis: PackagingAnalysis | null = null;
  /** True from the start of a read until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: PackagingReaderOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new PackagingReaderError("INVALID_CONFIG", "createAnalysis must be a function");
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

  /** Reads the packaging and ingredients in one frame. */
  async read(frame: Uint8Array, atMs: number): Promise<PackagingResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: PackagingAnalysis;
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

      const parsed = parsePackaging(record.value);
      if (parsed === null) return this.refuse("MALFORMED_RESPONSE");
      return {
        status: "OK",
        productName: parsed.productName,
        ingredientsState: stateOf(parsed.ingredientsState, parsed.partial),
        partial: parsed.partial,
        printedIngredients: parsed.printed,
        interpretations: parsed.interpretations,
        readAtMs: atMs,
      };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: PackagingRefusal): PackagingResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the read in progress, if any. Its provider result is discarded. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}
