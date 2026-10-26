import {
  serializeMeasurementCsv,
  type GlassesLink,
  type ImportableEvidenceLevel,
  type Language,
  type MeasurementRecord,
  type NetworkType,
  type RunByRole,
} from "@lensmate/core";
import type { EnvelopeMessage } from "@lensmate/protocol";

/** The button event that starts one capture-to-phone try. A single tap takes a photo. */
export const CAPTURE_TRIGGER_ACTION = "BUTTON_ACTION_SINGLE_TAP";

/**
 * Both timestamps come from one clock (performance.now) in one process, so subtracting them is valid. This is
 * harness timing, not transport latency: two independent device clocks are never subtracted.
 */
const SAME_CLOCK_TIMING = "same_clock_simulator" as const;

/** Glasses link that also reports when the glasses emitted its latest button event (virtual glasses today). */
export interface TimedGlasses extends GlassesLink {
  readonly lastButtonAtMs: number | undefined;
}

/**
 * Provenance for one run. The operator fills it in; nothing here is inferred or guessed.
 * `runId` must be unique for each run and must not contain personal details.
 */
export interface RecorderContext {
  readonly runId: string;
  readonly evidenceLevel: ImportableEvidenceLevel;
  readonly runByRole: RunByRole;
  readonly deviceModel: string;
  readonly osVersion: string;
  readonly appBuild: string;
  readonly appCommit: string;
  readonly easBuildId: string;
  readonly networkType: NetworkType;
  readonly provider: string;
  readonly sampleSet: string;
  readonly batteryStartPct: string;
}

/**
 * Times capture to phone from event timestamps only, with no per-frame or per-sample work in JavaScript. Each
 * trigger event is one try. A try that cannot be timed is recorded as failed, with the reason, and is never
 * estimated.
 */
export class CaptureToPhoneRecorder {
  private readonly records: MeasurementRecord[] = [];
  private readonly trials = new Map<Language, number>();
  private language: Language = "en";
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly glasses: TimedGlasses,
    private readonly clock: () => number,
    private readonly context: RecorderContext,
    private readonly dateUtc: () => string = nowUtc,
  ) {}

  /** Language for the tries that follow. Each language has its own trial numbers. */
  beginLanguage(language: Language): void {
    this.language = language;
  }

  start(): void {
    if (this.unsubscribe !== undefined) {
      return;
    }
    this.unsubscribe = this.glasses.subscribe((message) => {
      this.onEnvelope(message);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  get tries(): readonly MeasurementRecord[] {
    return this.records;
  }

  /** Every try recorded so far, in the template format. Accepted by the measurement import validator. */
  exportCsv(): string {
    return serializeMeasurementCsv(this.records);
  }

  private onEnvelope(message: EnvelopeMessage): void {
    if (message.button?.action !== CAPTURE_TRIGGER_ACTION) {
      return;
    }
    const phoneAt = this.clock();
    const capturedAt = this.glasses.lastButtonAtMs;
    const trial = (this.trials.get(this.language) ?? 0) + 1;
    this.trials.set(this.language, trial);

    const id = `${this.context.runId}-${this.language}-cap-${String(trial).padStart(3, "0")}`;
    if (capturedAt === undefined || !Number.isFinite(capturedAt)) {
      this.push(id, trial, "failed", {}, "no glasses timestamp for this button event");
    } else if (phoneAt < capturedAt) {
      this.push(
        id,
        trial,
        "failed",
        {},
        "phone clock is earlier than the glasses timestamp; try not timed",
      );
    } else {
      this.push(id, trial, "completed", { capture: capturedAt, phone_received: phoneAt }, "");
    }
  }

  private push(
    id: string,
    trial: number,
    outcome: "completed" | "failed",
    marks: MeasurementRecord["marks"],
    notes: string,
  ): void {
    const context = this.context;
    this.records.push({
      measurementId: id,
      measure: "capture_to_phone",
      outcome,
      language: this.language,
      trial,
      evidenceLevel: context.evidenceLevel,
      timingSource: SAME_CLOCK_TIMING,
      runByRole: context.runByRole,
      dateUtc: this.dateUtc(),
      deviceModel: context.deviceModel,
      osVersion: context.osVersion,
      appBuild: context.appBuild,
      appCommit: context.appCommit,
      easBuildId: context.easBuildId,
      networkType: context.networkType,
      provider: context.provider,
      sampleSet: context.sampleSet,
      marks,
      batteryStartPct: context.batteryStartPct,
      rawLocation: "",
      notes,
    });
  }
}

function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
