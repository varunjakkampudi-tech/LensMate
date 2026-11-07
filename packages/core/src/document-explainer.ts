/**
 * Reading and explaining documents, graphs and diagrams (checklist C07).
 *
 * Each explanation runs in a fresh C02 analysis session from an injected factory, so authorization, disclosure,
 * spend limits, sampling and cancellation are the C02 guarantees. The provider's output is untrusted at runtime.
 * Observed elements and explanations are kept in separate lists. Every explanation must cite the element ids
 * it rests on; a citation to an unknown element is refused, and an explanation with no citation is kept but
 * marked UNCITED. A citation shows only that the element exists, never that it substantiates the explanation, so
 * no explanation is reported as semantically verified. Nothing is retained after an explanation settles.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export const SUBJECT_KINDS = ["DOCUMENT", "GRAPH", "DIAGRAM"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];
export type ElementBasis = "EXTRACTED" | "OBSERVED";
export type ExplanationSupport = "CITED" | "UNCITED";
export type ExplainState = "COMPLETE" | "PARTIAL" | "AMBIGUOUS" | "EMPTY";

export interface ReadElement {
  readonly id: string;
  readonly text: string | null;
  readonly basis: ElementBasis;
  readonly confidence: number;
  readonly certainty: "HIGH" | "LOW";
}

export interface Explanation {
  readonly text: string;
  readonly citations: readonly string[];
  readonly support: ExplanationSupport;
  /** Always false: structural citation checks do not verify that evidence substantiates the claim. */
  readonly semanticallyVerified: false;
  readonly confidence: number;
  readonly certainty: "HIGH" | "LOW";
}

/** One C02 analysis session, as used here. */
export interface ExplainAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface DocumentExplainerOptions {
  /** Creates one C02 analysis session per explanation. */
  readonly createAnalysis: () => ExplainAnalysis;
}

export type ExplainRefusal =
  | "BAD_INPUT"
  | "BUSY"
  | "CANCELLED"
  | "MALFORMED_RESPONSE"
  | "UNSUPPORTED_REFERENCE"
  | "STAGE_FAILED"
  | FrameAnalysisRefusal;

export type ExplainResult =
  | {
      readonly status: "OK";
      readonly state: ExplainState;
      readonly partial: boolean;
      readonly subject: SubjectKind;
      readonly elements: readonly ReadElement[];
      readonly explanations: readonly Explanation[];
      readonly explainedAtMs: number;
    }
  | { readonly status: "REFUSED"; readonly reason: ExplainRefusal };

const MAX_RESPONSE_CHARS = 16384;
const MAX_ELEMENTS = 50;
const MAX_EXPLANATIONS = 20;
const MAX_CITATIONS = 10;
const MAX_TEXT_CHARS = 300;
const MAX_ID_CHARS = 32;
const LOW_CONFIDENCE = 0.5;
const ID_PATTERN = /^[a-z0-9_-]+$/;

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

export class DocumentExplainerError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "DocumentExplainerError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFrameAnalysisRefusal(value: unknown): value is FrameAnalysisRefusal {
  return typeof value === "string" && FRAME_ANALYSIS_REFUSALS.some((code) => code === value);
}

/** Control characters are refused, except line breaks. */
function hasDisallowedControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isLineBreak = code === 10 || code === 13;
    if ((code < 32 && !isLineBreak) || code === 127) return true;
  }
  return false;
}

function isSubjectKind(value: unknown): value is SubjectKind {
  return typeof value === "string" && (SUBJECT_KINDS as readonly string[]).includes(value);
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_CHARS &&
    ID_PATTERN.test(value)
  );
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Parses the provider's text against the explanation contract. Returns null when the shape does not match, and
 * a marker when a citation names an element that does not exist.
 */
export function parseExplanation(raw: unknown):
  | {
      kind: "OK";
      subject: SubjectKind;
      partial: boolean;
      elements: ReadElement[];
      explanations: Explanation[];
    }
  | { kind: "UNSUPPORTED_REFERENCE" }
  | null {
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
  const subject = reading["subject"];
  const partial = reading["partial"];
  const elementList = reading["elements"];
  const explanationList = reading["explanations"];
  if (!isSubjectKind(subject) || typeof partial !== "boolean") return null;
  if (!Array.isArray(elementList) || elementList.length > MAX_ELEMENTS) return null;
  if (!Array.isArray(explanationList) || explanationList.length > MAX_EXPLANATIONS) return null;

  const elements: ReadElement[] = [];
  const ids = new Set<string>();
  for (const entry of elementList) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const id = record["id"];
    const text = record["text"];
    const basis = record["basis"];
    const confidence = record["confidence"];
    if (!isId(id) || ids.has(id)) return null;
    if (text !== null && text !== undefined) {
      if (typeof text !== "string" || text.length > MAX_TEXT_CHARS || hasDisallowedControl(text))
        return null;
    }
    if (basis !== "EXTRACTED" && basis !== "OBSERVED") return null;
    if (!isConfidence(confidence)) return null;
    ids.add(id);
    elements.push({
      id,
      text: typeof text === "string" ? text : null,
      basis,
      confidence,
      certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH",
    });
  }

  const explanations: Explanation[] = [];
  for (const entry of explanationList) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const text = record["text"];
    const citations = record["citations"];
    const confidence = record["confidence"];
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_CHARS) return null;
    if (hasDisallowedControl(text)) return null;
    if (!Array.isArray(citations) || citations.length > MAX_CITATIONS) return null;
    if (!citations.every((citation) => isId(citation))) return null;
    if (!isConfidence(confidence)) return null;
    // Every citation must name an element that was actually reported. A fabricated reference is refused outright.
    const cited: string[] = citations.filter(isId);
    if (!cited.every((citation) => ids.has(citation))) return { kind: "UNSUPPORTED_REFERENCE" };
    // An explanation is supported only when it cites at least one observed or extracted element.
    const support: ExplanationSupport = cited.length > 0 ? "CITED" : "UNCITED";
    explanations.push({
      text,
      citations: cited,
      support,
      semanticallyVerified: false,
      confidence,
      certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH",
    });
  }
  return { kind: "OK", subject, partial, elements, explanations };
}

function stateOf(elements: readonly ReadElement[], partial: boolean): ExplainState {
  if (partial) return "PARTIAL";
  if (elements.length === 0) return "EMPTY";
  if (elements.every((element) => element.certainty === "LOW")) return "AMBIGUOUS";
  return "COMPLETE";
}

export class DocumentExplainer {
  private readonly createAnalysis: () => ExplainAnalysis;
  private currentAnalysis: ExplainAnalysis | null = null;
  /** True from the start of an explanation until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: DocumentExplainerOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new DocumentExplainerError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    this.createAnalysis = options.createAnalysis;
  }

  /** True while an explanation is in progress. */
  get explaining(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Reads and explains one document, graph or diagram in the frame. */
  async explain(frame: Uint8Array, atMs: number): Promise<ExplainResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: ExplainAnalysis;
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

      const parsed = parseExplanation(record.value);
      if (parsed === null) return this.refuse("MALFORMED_RESPONSE");
      if (parsed.kind === "UNSUPPORTED_REFERENCE") return this.refuse("UNSUPPORTED_REFERENCE");
      return {
        status: "OK",
        state: stateOf(parsed.elements, parsed.partial),
        partial: parsed.partial,
        subject: parsed.subject,
        elements: parsed.elements,
        explanations: parsed.explanations,
        explainedAtMs: atMs,
      };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: ExplainRefusal): ExplainResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the explanation in progress, if any. Its provider result is discarded. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}
