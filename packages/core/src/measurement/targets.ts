/**
 * Measurement targets for the capture-to-phone, latency and interruption measures.
 *
 * These are design targets, not release guarantees. Do not change a number here to make a result pass. A change
 * needs a recorded owner decision.
 */
export const LANGUAGES = ["en", "te", "hi", "mixed"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Evidence levels, from the least to the most realistic test setup. */
export const ALL_EVIDENCE_LEVELS = [
  "simulator",
  "emulator",
  "real phone",
  "bench hardware",
  "first wearable prototype",
  "integrated advanced wearable",
  "commercially prepared hardware",
] as const;

/** Levels this import accepts. Hardware levels are not reachable by any software measurement in this repository. */
export const IMPORTABLE_EVIDENCE_LEVELS = ["simulator", "emulator", "real phone"] as const;
export type ImportableEvidenceLevel = (typeof IMPORTABLE_EVIDENCE_LEVELS)[number];

/**
 * How the two timestamps of a try were taken. Only the same-clock simulator source is supported: both timestamps
 * come from one clock in one process. Subtracting timestamps from two independent device clocks needs a validated
 * synchronization, which does not exist yet, so no transport source is accepted (see docs/measurements/traceability.md).
 */
export const IMPORTABLE_TIMING_SOURCES = ["same_clock_simulator"] as const;
export type TimingSource = (typeof IMPORTABLE_TIMING_SOURCES)[number];

/**
 * Reserved marker for dry runs. A dry run writes this as its app_commit and a run ID that starts with the prefix,
 * so a rehearsal can never pass as real phone evidence even if its evidence_level is edited. The validator and the
 * screen both refuse real phone rows that carry either marker.
 */
export const DRY_RUN_COMMIT_MARKER = "local-dry-run";
export const DRY_RUN_RUN_ID_PREFIX = "dryrun-";

/** Measures this version can record and import. Each one is instrumented in the app or the simulator. */
export const SUPPORTED_MEASURES = ["capture_to_phone", "latency_total", "interruption"] as const;
export type SupportedMeasure = (typeof SUPPORTED_MEASURES)[number];

/** Glasses capture to phone: 0.3 seconds. A stage budget: at or under passes. */
export const CAPTURE_TO_PHONE_BUDGET_MS = 300;
/** Recognition of first words: 0.5 seconds. Not instrumented yet. */
export const RECOGNITION_FIRST_WORDS_BUDGET_MS = 500;
/** Answer or translation, first sentence: 1.0 second. Not instrumented yet. */
export const FIRST_SENTENCE_BUDGET_MS = 1000;
/** Speech output starts: 0.5 seconds. Not instrumented yet. */
export const SPEECH_OUTPUT_BUDGET_MS = 500;
/** Total short request: "under 2.5 seconds", so 2500 ms itself fails. */
export const TOTAL_SHORT_REQUEST_BUDGET_MS = 2500;
/** Interruption (target): stop within 0.5 seconds. At 500 ms exactly, the try passes. */
export const INTERRUPTION_BUDGET_MS = 500;

/** 50 requests per language, at least 90 percent meeting the budget. */
export const LATENCY_ACCEPTANCE = {
  minimumAttempts: 50,
  requiredPassPercent: 90,
} as const;

/**
 * Stop within 0.5 seconds in 95 percent of tries.
 * No minimum number of tries is set, so none is enforced here. The owner decides it.
 */
export const INTERRUPTION_ACCEPTANCE = {
  requiredPassPercent: 95,
} as const;
