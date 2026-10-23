import {
  CAPTURE_TO_PHONE_BUDGET_MS,
  INTERRUPTION_ACCEPTANCE,
  INTERRUPTION_BUDGET_MS,
  LANGUAGES,
  LATENCY_ACCEPTANCE,
  TOTAL_SHORT_REQUEST_BUDGET_MS,
  type Language,
} from "./targets.js";

/** Monotonic timestamps in milliseconds, recorded at the events named here. */
export type MarkName =
  | "capture"
  | "phone_received"
  | "first_words"
  | "first_sentence"
  | "speech_start"
  | "stop_press"
  | "speech_stopped";

export type Marks = Partial<Readonly<Record<MarkName, number>>>;

/** One try. `completed` is false for a failed try, which still counts in the attempts. */
export interface MeasuredAttempt {
  readonly language: Language;
  readonly completed: boolean;
  readonly marks: Marks;
}

/** Elapsed milliseconds between two marks. Undefined when a mark is missing. Throws when time runs backwards. */
export function intervalMs(marks: Marks, from: MarkName, to: MarkName): number | undefined {
  const start = marks[from];
  const end = marks[to];
  if (start === undefined || end === undefined) {
    return undefined;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError(`marks ${from} and ${to} must be finite numbers`);
  }
  if (end < start) {
    throw new RangeError(`mark ${to} is earlier than ${from}`);
  }
  return end - start;
}

export interface LanguageReport {
  readonly language: Language;
  /** Every try for this language, including failed and unmeasurable tries. */
  readonly attempts: number;
  /** Tries that produced a valid interval. */
  readonly measured: number;
  /** Measured tries that met the budget. */
  readonly passes: number;
  /** Whole-number percentage of attempts that passed. 0 when there are no attempts. */
  readonly passPercent: number;
}

/**
 * Scores every language for one interval against one pass rule.
 * A failed try, or one whose marks are missing or out of order, counts as an attempt that did not pass.
 */
export function evaluateByLanguage(
  attempts: readonly MeasuredAttempt[],
  interval: readonly [MarkName, MarkName],
  passes: (ms: number) => boolean,
): LanguageReport[] {
  return LANGUAGES.map((language) => {
    const mine = attempts.filter((attempt) => attempt.language === language);
    let measured = 0;
    let passed = 0;
    for (const attempt of mine) {
      const ms = attemptInterval(attempt, interval);
      if (ms === undefined) {
        continue;
      }
      measured += 1;
      if (passes(ms)) {
        passed += 1;
      }
    }
    return {
      language,
      attempts: mine.length,
      measured,
      passes: passed,
      passPercent: mine.length === 0 ? 0 : Math.floor((passed * 100) / mine.length),
    };
  });
}

function attemptInterval(
  attempt: MeasuredAttempt,
  [from, to]: readonly [MarkName, MarkName],
): number | undefined {
  if (!attempt.completed) {
    return undefined;
  }
  try {
    return intervalMs(attempt.marks, from, to);
  } catch {
    return undefined;
  }
}

/** Glasses capture to phone. A stage budget: 300 ms or less passes (v9 section 6.4). */
export function captureToPhoneReport(attempts: readonly MeasuredAttempt[]): LanguageReport[] {
  return evaluateByLanguage(
    attempts,
    ["capture", "phone_received"],
    (ms) => ms <= CAPTURE_TO_PHONE_BUDGET_MS,
  );
}

/** Total short request, capture to speech start. Strictly under 2500 ms passes (v9 section 6.4). */
export function latencyTotalReport(attempts: readonly MeasuredAttempt[]): LanguageReport[] {
  return evaluateByLanguage(
    attempts,
    ["capture", "speech_start"],
    (ms) => ms < TOTAL_SHORT_REQUEST_BUDGET_MS,
  );
}

/** Interruption, press to speech stopped. 500 ms or less passes (G19 TARGET). */
export function interruptionReport(attempts: readonly MeasuredAttempt[]): LanguageReport[] {
  return evaluateByLanguage(
    attempts,
    ["stop_press", "speech_stopped"],
    (ms) => ms <= INTERRUPTION_BUDGET_MS,
  );
}

/** Goal 14.2: at least 50 requests and at least 90 percent meeting the budget, for this language. */
export function latencyCriterionMet(report: LanguageReport): boolean {
  return (
    report.attempts >= LATENCY_ACCEPTANCE.minimumAttempts &&
    report.passPercent >= LATENCY_ACCEPTANCE.requiredPassPercent
  );
}

/** GAP_MATRIX item 7: at least 95 percent of tries. No minimum number of tries is set in the documents. */
export function interruptionCriterionMet(report: LanguageReport): boolean {
  return report.attempts > 0 && report.passPercent >= INTERRUPTION_ACCEPTANCE.requiredPassPercent;
}
