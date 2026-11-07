/**
 * Scene layout and visual relationships (checklist C05).
 *
 * Each description runs in a fresh C02 analysis session, created by an injected factory, so authorization,
 * disclosure, spend limits, sampling and cancellation are the C02 guarantees. The provider's output is
 * untrusted at runtime: it is parsed as a bounded list of relations from a fixed vocabulary, and every value
 * is checked before use. Relations are reported only as the provider states them, with explicit confidence.
 * Nothing is retained after a description settles.
 */

import type { FrameAnalysisRefusal } from "./frame-analysis.js";

export const RELATION_KINDS = [
  "LEFT_OF",
  "RIGHT_OF",
  "ABOVE",
  "BELOW",
  "ON",
  "NEXT_TO",
  "IN_FRONT_OF",
  "BEHIND",
  "INSIDE",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
type Certainty = "HIGH" | "LOW";
export type SceneState = "DESCRIBED" | "AMBIGUOUS" | "EMPTY";

export interface SceneRelation {
  readonly subject: string;
  readonly relation: RelationKind;
  readonly object: string;
  readonly confidence: number;
  readonly certainty: Certainty;
}

/** One C02 analysis session, as used here. */
export interface SceneAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface SceneDescriberOptions {
  /** Creates one C02 analysis session per description. */
  readonly createAnalysis: () => SceneAnalysis;
}

export type SceneRefusal =
  "BAD_INPUT" | "BUSY" | "CANCELLED" | "MALFORMED_RESPONSE" | "STAGE_FAILED" | FrameAnalysisRefusal;

export type SceneResult =
  | {
      readonly status: "OK";
      readonly state: SceneState;
      readonly relations: readonly SceneRelation[];
      readonly describedAtMs: number;
    }
  | { readonly status: "REFUSED"; readonly reason: SceneRefusal };

const MAX_RESPONSE_CHARS = 8192;
const MAX_RELATIONS = 20;
const MAX_LABEL_CHARS = 80;
const LOW_CONFIDENCE = 0.5;

/** Every refusal code the C02 analysis session can return. Checked at runtime, so untrusted envelopes cannot inject codes. */
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

export class SceneDescriberError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "SceneDescriberError";
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

function isRelationKind(value: unknown): value is RelationKind {
  return typeof value === "string" && (RELATION_KINDS as readonly string[]).includes(value);
}

function isLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_LABEL_CHARS &&
    !hasControlCharacter(value)
  );
}

/** Parses the provider's text against the relation contract. Returns null when it does not match. */
export function parseRelations(raw: unknown): SceneRelation[] | null {
  // Untrusted at runtime: anything that is not a string is a malformed response.
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_RESPONSE_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_RELATIONS) return null;
  const relations: SceneRelation[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const subject = record["subject"];
    const relation = record["relation"];
    const object = record["object"];
    const confidence = record["confidence"];
    if (!isLabel(subject) || !isLabel(object) || !isRelationKind(relation)) return null;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    relations.push({
      subject,
      relation,
      object,
      confidence,
      certainty: confidence < LOW_CONFIDENCE ? "LOW" : "HIGH",
    });
  }
  return relations;
}

function stateOf(relations: readonly SceneRelation[]): SceneState {
  if (relations.length === 0) return "EMPTY";
  return relations.every((relation) => relation.certainty === "LOW") ? "AMBIGUOUS" : "DESCRIBED";
}

export class SceneDescriber {
  private readonly createAnalysis: () => SceneAnalysis;
  private currentAnalysis: SceneAnalysis | null = null;
  /** True from the start of a description until it settles. */
  private active = false;
  private cancelRequested = false;

  constructor(options: SceneDescriberOptions) {
    const factoryValue: unknown = options.createAnalysis;
    if (typeof factoryValue !== "function") {
      throw new SceneDescriberError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    this.createAnalysis = options.createAnalysis;
  }

  /** True while a description is in progress. */
  get describing(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Describes the layout and visual relationships in one frame. */
  async describe(frame: Uint8Array, atMs: number): Promise<SceneResult> {
    if (!(frame instanceof Uint8Array) || frame.byteLength === 0 || !isValidTime(atMs)) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    this.active = true;
    this.cancelRequested = false;
    try {
      let analysis: SceneAnalysis;
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

      const relations = parseRelations(record.value);
      if (relations === null) return this.refuse("MALFORMED_RESPONSE");
      return {
        status: "OK",
        state: stateOf(relations),
        relations,
        describedAtMs: atMs,
      };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: SceneRefusal): SceneResult {
    return { status: "REFUSED", reason };
  }

  /** Cancels the description in progress, if any. Its provider result is discarded. */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.currentAnalysis?.cancel();
  }
}
