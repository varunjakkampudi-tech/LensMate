/**
 * Voice-triggered visual question answering (checklist C03).
 *
 * A spoken question is answered only after the platform verifies the wearer's utterance (exactly true).
 * The coordinator then takes one photo through the C01 capture controller and analyses it through the C02
 * frame-analysis session. Those controllers keep their own safeguards (wearer intent, permission, indicator,
 * authorization, disclosure, spend limits, sampling and cancellation); this module does not repeat them.
 * Cancellation applies from the start of a question, at every stage. An answer that arrives after
 * cancellation is discarded. The coordinator keeps no copy of the question, frame or answer.
 * Speech recognition and answer output are platform adapters outside core.
 */

import type { CaptureRefusal, PlatformCheck } from "./camera-capture.js";
import type { FrameAnalysisRefusal } from "./frame-analysis.js";

/** The C01 capture controller, as used here. */
export interface QuestionCamera {
  capturePhoto(
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly frame: Uint8Array; readonly capturedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: CaptureRefusal }
  >;
  cancel(): void;
}

/** The C02 frame-analysis session, as used here. */
export interface QuestionAnalysis {
  analyze(
    frame: Uint8Array,
    atMs: number,
  ): Promise<
    | { readonly status: "OK"; readonly value: string; readonly analyzedAtMs: number }
    | { readonly status: "REFUSED"; readonly reason: FrameAnalysisRefusal }
  >;
  cancel(): void;
}

export interface VoiceQuestionOptions {
  readonly camera: QuestionCamera;
  /**
   * Creates one analysis session per question, given the validated question, so the question reaches the
   * provider and cancelling one question does not block the next.
   */
  readonly createAnalysis: (question: string) => QuestionAnalysis;
  /** Verified wearer utterance for this question (exact true). */
  readonly utteranceVerified: PlatformCheck;
}

export type QuestionRefusal =
  | "NO_WEARER_INTENT"
  | "BUSY"
  | "BAD_INPUT"
  | "CANCELLED"
  | "STAGE_FAILED"
  | CaptureRefusal
  | FrameAnalysisRefusal;

export type QuestionResult =
  | { readonly status: "OK"; readonly answer: string; readonly askedAtMs: number }
  | { readonly status: "REFUSED"; readonly reason: QuestionRefusal };

const MAX_QUESTION_LENGTH = 500;

export class VoiceQuestionError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG",
    message: string,
  ) {
    super(message);
    this.name = "VoiceQuestionError";
  }
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Runs the utterance check. A throw or a non-true value counts as not verified. */
async function verified(check: PlatformCheck): Promise<boolean> {
  try {
    return (await check()) === true;
  } catch {
    return false;
  }
}

export class VoiceQuestion {
  private readonly camera: QuestionCamera;
  private readonly createAnalysis: (question: string) => QuestionAnalysis;
  private currentAnalysis: QuestionAnalysis | null = null;
  private readonly utteranceVerified: PlatformCheck;
  /** True from the start of a question until it settles, including during the utterance check. */
  private active = false;
  private cancelRequested = false;

  constructor(options: VoiceQuestionOptions) {
    const cameraValue: unknown = options.camera;
    if (
      typeof cameraValue !== "object" ||
      cameraValue === null ||
      typeof (cameraValue as { capturePhoto?: unknown }).capturePhoto !== "function" ||
      typeof (cameraValue as { cancel?: unknown }).cancel !== "function"
    ) {
      throw new VoiceQuestionError("INVALID_CONFIG", "camera must provide capturePhoto and cancel");
    }
    const createValue: unknown = options.createAnalysis;
    if (typeof createValue !== "function") {
      throw new VoiceQuestionError("INVALID_CONFIG", "createAnalysis must be a function");
    }
    const utteranceValue: unknown = options.utteranceVerified;
    if (typeof utteranceValue !== "function") {
      throw new VoiceQuestionError("INVALID_CONFIG", "utteranceVerified must be a function");
    }
    this.camera = options.camera;
    this.createAnalysis = options.createAnalysis;
    this.utteranceVerified = options.utteranceVerified;
  }

  /** True while a question is in progress. */
  get asking(): boolean {
    return this.isActive();
  }

  // Read through methods so the flags are not narrowed across awaits.
  private isActive(): boolean {
    return this.active;
  }

  private cancelPending(): boolean {
    return this.cancelRequested;
  }

  /** Answers one spoken question about what the wearer is looking at. */
  async ask(question: string, atMs: number): Promise<QuestionResult> {
    if (
      typeof question !== "string" ||
      question.trim() === "" ||
      question.length > MAX_QUESTION_LENGTH ||
      !isValidTime(atMs)
    ) {
      return { status: "REFUSED", reason: "BAD_INPUT" };
    }
    if (this.isActive()) return { status: "REFUSED", reason: "BUSY" };

    // Mark the question active before the first await, so cancel() can reach every stage from now on.
    this.active = true;
    this.cancelRequested = false;
    try {
      if (!(await verified(this.utteranceVerified))) {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "NO_WEARER_INTENT");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");

      // Unexpected stage exceptions become STAGE_FAILED. Cancellation takes precedence over any failure.
      let photo: Awaited<ReturnType<QuestionCamera["capturePhoto"]>>;
      try {
        photo = await this.camera.capturePhoto(atMs);
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");
      if (photo.status === "REFUSED") return this.refuse(photo.reason);

      let analysis: QuestionAnalysis;
      try {
        analysis = this.createAnalysis(question);
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      this.currentAnalysis = analysis;
      let result: Awaited<ReturnType<QuestionAnalysis["analyze"]>>;
      try {
        result = await analysis.analyze(photo.frame, atMs);
      } catch {
        return this.refuse(this.cancelPending() ? "CANCELLED" : "STAGE_FAILED");
      }
      if (this.cancelPending()) return this.refuse("CANCELLED");
      if (result.status === "REFUSED") return this.refuse(result.reason);
      return { status: "OK", answer: result.value, askedAtMs: atMs };
    } finally {
      this.active = false;
      this.cancelRequested = false;
      this.currentAnalysis = null;
    }
  }

  private refuse(reason: QuestionRefusal): QuestionResult {
    return { status: "REFUSED", reason };
  }

  /**
   * Cancels the question in progress, if any. Whichever stage is running is cancelled too, and its
   * result is discarded.
   */
  cancel(): void {
    if (!this.isActive()) return;
    this.cancelRequested = true;
    this.camera.cancel();
    this.currentAnalysis?.cancel();
  }
}
