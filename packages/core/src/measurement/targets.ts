/**
 * Measurement targets for P-1 (LensMate-v9 section 6.4, section 26 and Goal 14.2; GAP_MATRIX items 7 and 8).
 *
 * These are design targets, not release guarantees (v9 section 6.4). Do not change a number here to make a
 * result pass. A change needs an owner decision recorded in blocker.txt.
 */
export const LANGUAGES = ["en", "te", "hi", "mixed"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Evidence levels from Goal section 1.3, in the order the Goal lists them. */
export const ALL_EVIDENCE_LEVELS = [
  "simulator",
  "emulator",
  "real phone",
  "bench hardware",
  "first wearable prototype",
  "integrated advanced wearable",
  "commercially prepared hardware",
] as const;

/** Levels this P-1 import accepts. Hardware levels are not reachable by any P-1 software measurement. */
export const IMPORTABLE_EVIDENCE_LEVELS = ["simulator", "emulator", "real phone"] as const;
export type ImportableEvidenceLevel = (typeof IMPORTABLE_EVIDENCE_LEVELS)[number];

/** Measures this version can record and import. Each one is instrumented in the app or the simulator. */
export const SUPPORTED_MEASURES = ["capture_to_phone", "latency_total", "interruption"] as const;
export type SupportedMeasure = (typeof SUPPORTED_MEASURES)[number];

/** v9 section 6.4, glasses capture to phone: 0.3 seconds. A stage budget: at or under passes. */
export const CAPTURE_TO_PHONE_BUDGET_MS = 300;
/** v9 section 6.4, recognition of first words: 0.5 seconds. Not instrumented yet. */
export const RECOGNITION_FIRST_WORDS_BUDGET_MS = 500;
/** v9 section 6.4, answer or translation, first sentence: 1.0 second. Not instrumented yet. */
export const FIRST_SENTENCE_BUDGET_MS = 1000;
/** v9 section 6.4, speech output starts: 0.5 seconds. Not instrumented yet. */
export const SPEECH_OUTPUT_BUDGET_MS = 500;
/** v9 section 6.4, total short request: "under 2.5 seconds", so 2500 ms itself fails. */
export const TOTAL_SHORT_REQUEST_BUDGET_MS = 2500;
/** v9 section 6.4 and G19 (TARGET): stop within 0.5 seconds. At 500 ms exactly, the try passes. */
export const INTERRUPTION_BUDGET_MS = 500;

/** Goal 14.2 and v9 section 6.4: 50 requests per language, at least 90 percent meeting the budget. */
export const LATENCY_ACCEPTANCE = {
  minimumAttempts: 50,
  requiredPassPercent: 90,
} as const;

/**
 * Goal 14.2 and GAP_MATRIX item 7: stop within 0.5 seconds in 95 percent of tries.
 * The documents give no minimum number of tries, so none is enforced here. The owner decides it (blocker.txt).
 */
export const INTERRUPTION_ACCEPTANCE = {
  requiredPassPercent: 95,
} as const;
