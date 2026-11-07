/**
 * Visual product search and comparison (checklist C09).
 *
 * A product is identified from one frame in a fresh C02 analysis session created by an injected factory, so
 * authorization, disclosure, spend limits, sampling and cancellation are the C02 guarantees. The observed
 * product comes only from the frame. Candidate products come from an injected search, which is untrusted at
 * runtime. Observed details and external candidates are kept apart, and every candidate is marked unverified.
 * Missing prices and availability stay unknown. Nothing is retained after an identification settles.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export type MatchState = "LIKELY" | "UNCERTAIN" | "CONFLICT";
export type Availability = "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
export type SearchState = "MATCHED" | "NO_MATCH";

export interface ObservedProduct {
  readonly name: string;
  readonly brand: string | null;
  readonly basis: "OBSERVED";
  readonly confidence: number;
}

export interface ExternalCandidate {
  readonly title: string;
  readonly brand: string | null;
  readonly source: string;
  readonly price: number | null;
  readonly currency: string | null;
  readonly availability: Availability;
}

export interface CandidateMatch extends ExternalCandidate {
  readonly matchState: MatchState;
  /** Always true: every candidate comes from outside the frame. */
  readonly external: true;
  /** Always false: no candidate is presented as verified. */
  readonly verified: false;
}

/** One C02 analysis session, as used here. */
export interface IdentifyAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

/** External product search. Its results are untrusted at runtime. */
export type ProductSearch = (name: string, brand: string | null) => Promise<unknown>;

export interface ProductSearchOptions {
  readonly createAnalysis: () => IdentifyAnalysis;
  readonly search: ProductSearch;
}

export type SearchRefusal =
  | "BAD_INPUT"
  | "BUSY"
  | "CANCELLED"
  | "MALFORMED_RESPONSE"
  | "SEARCH_FAILED"
  | "STAGE_FAILED"
  | FrameAnalysisRefusal;

export type SearchResult =
  | {
      readonly status: "OK";
      readonly state: SearchState;
      readonly observed: ObservedProduct;
      readonly matches: readonly CandidateMatch[];
      readonly identifiedAtMs: number;
    }
  | { readonly status: "REFUSED"; readonly reason: SearchRefusal };

const MAX_RESPONSE_CHARS = 8192;
const MAX_NAME_CHARS = 120;
const MAX_BRAND_CHARS = 80;
const MAX_TITLE_CHARS = 200;
const MAX_SOURCE_CHARS = 80;
const MAX_CANDIDATES = 20;

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

export class ProductSearchError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "ProductSearchError";
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

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Parses the provider's observed product. Returns null when it does not match the contract. */
export function parseObservation(raw: unknown): ObservedProduct | null {
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
  const record = parsed as Record<string, unknown>;
  const name = record["name"];
  const brand = record["brand"];
  const basis = record["basis"];
  const confidence = record["confidence"];
  if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_CHARS) return null;
  if (hasControlCharacter(name)) return null;
  if (brand !== null && brand !== undefined) {
    if (typeof brand !== "string" || brand.length === 0 || brand.length > MAX_BRAND_CHARS)
      return null;
    if (hasControlCharacter(brand)) return null;
  }
  if (basis !== "OBSERVED") return null;
  if (!isConfidence(confidence)) return null;
  return {
    name,
    brand: typeof brand === "string" ? brand : null,
    basis: "OBSERVED",
    confidence,
  };
}

/** Validates the untrusted search results. Returns null when any entry does not match the contract. */
export function parseCandidates(raw: unknown): ExternalCandidate[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_CANDIDATES) return null;
  const candidates: ExternalCandidate[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const title = record["title"];
    const brand = record["brand"];
    const source = record["source"];
    const price = record["price"];
    const currency = record["currency"];
    const availability = record["availability"];
    if (typeof title !== "string" || title.length === 0 || title.length > MAX_TITLE_CHARS)
      return null;
    if (hasControlCharacter(title)) return null;
    if (
      brand !== null &&
      (typeof brand !== "string" || brand.length === 0 || brand.length > MAX_BRAND_CHARS)
    )
      return null;
    if (typeof brand === "string" && hasControlCharacter(brand)) return null;
    if (typeof source !== "string" || source.length === 0 || source.length > MAX_SOURCE_CHARS)
      return null;
    if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0))
      return null;
    if (currency !== null && (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)))
      return null;
    if (
      availability !== "IN_STOCK" &&
      availability !== "OUT_OF_STOCK" &&
      availability !== "UNKNOWN"
    )
      return null;
    candidates.push({
      title,
      brand: typeof brand === "string" ? brand : null,
      source,
      price,
      currency,
      availability,
    });
  }
  return candidates;
}

/** Classifies a candidate against the observed product. A conflicting brand is reported as CONFLICT. */
export function classify(observed: ObservedProduct, candidate: ExternalCandidate): MatchState {
  // A conflict needs two stated brands that differ. A missing brand is never treated as a conflict.
  if (observed.brand !== null && candidate.brand !== null) {
    if (observed.brand.toLowerCase() !== candidate.brand.toLowerCase()) return "CONFLICT";
  }
  const title = candidate.title.toLowerCase();
  const name = observed.name.toLowerCase();
  return title.includes(name) ? "LIKELY" : "UNCERTAIN";
}

export class ProductSearcher {
  private readonly createAnalysis: () => IdentifyAnalysis;
  private readonly search: ProductSearch;
  private currentAnalysis: IdentifyAnalysis | null = null;
  /** True from the start of an identification until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: ProductSearchOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new ProductSearchError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    const searchValue: unknown = options.search;
    if (typeof searchValue !== "function") {
      throw new ProductSearchError("INVALID_CONFIG", "search must be a function");
    }
    this.createAnalysis = options.createAnalysis;
    this.search = options.search;
  }

  /** True while an identification is in progress. */
  get identifying(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Identifies the product in the frame and compares it with external candidates. */
  async find(frame: Uint8Array, atMs: number): Promise<SearchResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: IdentifyAnalysis;
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

      const observed = parseObservation(record.value);
      if (observed === null) return this.refuse("MALFORMED_RESPONSE");

      // Search only after the observation is validated, and never after a cancel.
      let searched: unknown;
      try {
        searched = await this.search(observed.name, observed.brand);
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "SEARCH_FAILED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");
      const candidates = parseCandidates(searched);
      if (candidates === null) return this.refuse("SEARCH_FAILED");

      const matches: CandidateMatch[] = candidates.map((candidate) => ({
        ...candidate,
        matchState: classify(observed, candidate),
        external: true,
        verified: false,
      }));
      const state: SearchState = matches.some((match) => match.matchState === "LIKELY")
        ? "MATCHED"
        : "NO_MATCH";
      return { status: "OK", state, observed, matches, identifiedAtMs: atMs };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: SearchRefusal): SearchResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the identification in progress, if any. Its analysis is cancelled and any later search is skipped. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}
