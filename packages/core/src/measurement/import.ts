import { formatCsvLine, parseCsv } from "./csv.js";
import {
  intervalMs,
  interruptionCriterionMet,
  interruptionReport,
  captureToPhoneReport,
  latencyCriterionMet,
  latencyTotalReport,
  type LanguageReport,
  type MarkName,
  type Marks,
  type MeasuredAttempt,
} from "./evaluate.js";
import {
  ALL_EVIDENCE_LEVELS,
  IMPORTABLE_EVIDENCE_LEVELS,
  IMPORTABLE_TIMING_SOURCES,
  LANGUAGES,
  SUPPORTED_MEASURES,
  type ImportableEvidenceLevel,
  type Language,
  type SupportedMeasure,
  type TimingSource,
} from "./targets.js";

/** Columns of the P-1 result template, in order. A file must contain every column and no others. */
export const MEASUREMENT_COLUMNS = [
  "measurement_id",
  "measure",
  "outcome",
  "language",
  "trial",
  "evidence_level",
  "timing_source",
  "run_by_role",
  "date_utc",
  "device_model",
  "os_version",
  "app_build",
  "app_commit",
  "eas_build_id",
  "network_type",
  "provider",
  "sample_set",
  "t_capture_ms",
  "t_phone_received_ms",
  "t_first_words_ms",
  "t_first_sentence_ms",
  "t_speech_start_ms",
  "t_stop_press_ms",
  "t_speech_stopped_ms",
  "battery_start_pct",
  "raw_location",
  "notes",
] as const;

const COLUMN_MARKS: Readonly<Record<string, MarkName>> = {
  t_capture_ms: "capture",
  t_phone_received_ms: "phone_received",
  t_first_words_ms: "first_words",
  t_first_sentence_ms: "first_sentence",
  t_speech_start_ms: "speech_start",
  t_stop_press_ms: "stop_press",
  t_speech_stopped_ms: "speech_stopped",
};

/** Marks each measure needs before a completed try is valid, in the order they must occur. */
const REQUIRED_CHAIN: Readonly<Record<SupportedMeasure, readonly MarkName[]>> = {
  capture_to_phone: ["capture", "phone_received"],
  latency_total: ["capture", "phone_received", "first_words", "first_sentence", "speech_start"],
  interruption: ["stop_press", "speech_stopped"],
};

const NETWORK_TYPES = ["wifi", "cellular", "none", "simulated"] as const;
const OUTCOMES = ["completed", "failed"] as const;
const RUN_BY_ROLES = ["owner", "agent"] as const;

export type Outcome = (typeof OUTCOMES)[number];
export type RunByRole = (typeof RUN_BY_ROLES)[number];
export type NetworkType = (typeof NETWORK_TYPES)[number];

/** A row that passed every check. Optional text fields are empty strings when absent. */
export interface MeasurementRecord {
  readonly measurementId: string;
  readonly measure: SupportedMeasure;
  readonly outcome: Outcome;
  readonly language: Language;
  readonly trial: number;
  readonly evidenceLevel: ImportableEvidenceLevel;
  readonly timingSource: TimingSource;
  readonly runByRole: RunByRole;
  readonly dateUtc: string;
  readonly deviceModel: string;
  readonly osVersion: string;
  readonly appBuild: string;
  readonly appCommit: string;
  readonly easBuildId: string;
  readonly networkType: NetworkType;
  readonly provider: string;
  readonly sampleSet: string;
  readonly marks: Marks;
  readonly batteryStartPct: string;
  readonly rawLocation: string;
  readonly notes: string;
}

export interface RejectedRow {
  /** 1-based line number in the file, counting the header as line 1. */
  readonly line: number;
  readonly measurementId: string;
  readonly reasons: readonly string[];
}

export interface ImportResult {
  readonly accepted: readonly MeasurementRecord[];
  readonly rejected: readonly RejectedRow[];
  /** File-level errors (missing or unknown columns, empty file). When present, nothing is accepted. */
  readonly fileErrors: readonly string[];
}

/** Validates a result file. Any row with a problem is rejected with every reason found for it. */
export function importMeasurementCsv(text: string): ImportResult {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return fileFailure(error instanceof Error ? error.message : "file could not be parsed");
  }
  const header = rows[0];
  if (header === undefined) {
    return fileFailure("file is empty");
  }
  const headerErrors = checkHeader(header);
  if (headerErrors.length > 0) {
    return fileFailure(...headerErrors);
  }

  const accepted: MeasurementRecord[] = [];
  const rejected: RejectedRow[] = [];
  const seenIds = new Set<string>();

  rows.slice(1).forEach((fields, offset) => {
    const line = offset + 2;
    const raw = toObject(header, fields);
    const measurementId = raw.measurement_id ?? "";
    const reasons = validateRow(raw, fields.length, header.length);
    if (measurementId !== "" && seenIds.has(measurementId)) {
      reasons.push(`duplicate measurement_id ${measurementId}`);
    }
    if (reasons.length > 0) {
      rejected.push({ line, measurementId, reasons });
      return;
    }
    seenIds.add(measurementId);
    accepted.push(toRecord(raw));
  });

  return { accepted, rejected, fileErrors: [] };
}

/** Serializes records back to the template format. Used by the in-app export and by the dry-run tests. */
export function serializeMeasurementCsv(records: readonly MeasurementRecord[]): string {
  const lines = [formatCsvLine(MEASUREMENT_COLUMNS)];
  for (const record of records) {
    lines.push(formatCsvLine(recordToFields(record)));
  }
  return `${lines.join("\n")}\n`;
}

function fileFailure(...errors: string[]): ImportResult {
  return { accepted: [], rejected: [], fileErrors: errors };
}

function checkHeader(header: readonly string[]): string[] {
  const errors: string[] = [];
  const known = new Set<string>(MEASUREMENT_COLUMNS);
  for (const column of MEASUREMENT_COLUMNS) {
    if (!header.includes(column)) {
      errors.push(`missing column ${column}`);
    }
  }
  for (const column of header) {
    if (!known.has(column)) {
      errors.push(`unknown column ${column}`);
    }
  }
  return errors;
}

function toObject(header: readonly string[], fields: readonly string[]): Record<string, string> {
  const object: Record<string, string> = {};
  header.forEach((column, index) => {
    object[column] = (fields[index] ?? "").trim();
  });
  return object;
}

function validateRow(
  raw: Record<string, string>,
  fieldCount: number,
  columnCount: number,
): string[] {
  const reasons: string[] = [];
  if (fieldCount !== columnCount) {
    reasons.push(`expected ${String(columnCount)} fields, found ${String(fieldCount)}`);
  }

  const id = raw.measurement_id ?? "";
  if (id === "") {
    reasons.push("missing measurement_id");
  }

  const measure = raw.measure ?? "";
  if (!isSupportedMeasure(measure)) {
    reasons.push(`measure "${measure}" is not instrumented or not supported by this import`);
  }

  const outcome = raw.outcome ?? "";
  if (!isOneOf(outcome, OUTCOMES)) {
    reasons.push(`outcome must be one of ${OUTCOMES.join(", ")}`);
  }

  const language = raw.language ?? "";
  if (!isOneOf(language, LANGUAGES)) {
    reasons.push(`language must be one of ${LANGUAGES.join(", ")}`);
  }

  const trial = raw.trial ?? "";
  if (!/^[1-9][0-9]*$/.test(trial)) {
    reasons.push("trial must be a positive whole number");
  }

  reasons.push(...checkEvidence(raw));
  reasons.push(...checkTiming(raw));
  reasons.push(...checkProvenance(raw));
  reasons.push(...checkPersonalData(raw));

  if (isSupportedMeasure(measure) && outcome === "completed") {
    reasons.push(...checkCompletedMarks(measure, raw));
  } else if (outcome === "failed") {
    reasons.push(...checkFailedRow(raw));
  }

  return reasons;
}

function checkEvidence(raw: Record<string, string>): string[] {
  const reasons: string[] = [];
  const level = raw.evidence_level ?? "";
  const runBy = raw.run_by_role ?? "";
  const device = raw.device_model ?? "";

  if (!isOneOf(level, ALL_EVIDENCE_LEVELS)) {
    reasons.push(`unknown evidence_level "${level}"`);
    return reasons;
  }
  if (!isOneOf(level, IMPORTABLE_EVIDENCE_LEVELS)) {
    reasons.push(
      `evidence_level "${level}" is above what the P-1 import accepts (simulator, emulator, real phone)`,
    );
    return reasons;
  }
  if (!isOneOf(runBy, RUN_BY_ROLES)) {
    reasons.push("run_by_role must be owner or agent");
  }
  if (level === "real phone") {
    if (runBy !== "owner") {
      reasons.push(
        "real phone evidence must be run by the owner; the agent never runs tests on the owner's phone",
      );
    }
    if (/simulator|emulator|virtual/i.test(device)) {
      reasons.push(`real phone claim contradicts device_model "${device}"`);
    }
    if ((raw.eas_build_id ?? "") === "") {
      reasons.push("real phone evidence needs eas_build_id");
    }
  }
  return reasons;
}

function checkTiming(raw: Record<string, string>): string[] {
  const source = raw.timing_source ?? "";
  if (isOneOf(source, IMPORTABLE_TIMING_SOURCES)) {
    return [];
  }
  if (source === "") {
    return ["missing timing_source"];
  }
  return [
    `timing_source "${source}" is not supported: transport timing needs a validated clock synchronization, which P-1 does not have yet`,
  ];
}

function checkProvenance(raw: Record<string, string>): string[] {
  const reasons: string[] = [];
  const required: readonly string[] = [
    "date_utc",
    "device_model",
    "os_version",
    "app_build",
    "app_commit",
    "provider",
    "sample_set",
  ];
  for (const column of required) {
    if ((raw[column] ?? "") === "") {
      reasons.push(`missing provenance field ${column}`);
    }
  }
  const network = raw.network_type ?? "";
  if (!isOneOf(network, NETWORK_TYPES)) {
    reasons.push(`network_type must be one of ${NETWORK_TYPES.join(", ")}`);
  }
  const date = raw.date_utc ?? "";
  if (
    date !== "" &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date) || Number.isNaN(Date.parse(date)))
  ) {
    reasons.push("date_utc must be an ISO 8601 UTC time such as 2026-10-24T10:00:00Z");
  }
  const battery = raw.battery_start_pct ?? "";
  if (battery !== "" && !isPercent(battery)) {
    reasons.push("battery_start_pct must be a whole number from 0 to 100, or empty");
  }
  return reasons;
}

function checkPersonalData(raw: Record<string, string>): string[] {
  const reasons: string[] = [];
  for (const column of ["notes", "raw_location", "sample_set", "device_model"]) {
    const value = raw[column] ?? "";
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(value)) {
      reasons.push(
        `${column} looks like an email address; personal details are not kept in results`,
      );
    }
    if (/(?<!\d)\+?\d[\d -]{8,}\d(?!\d)/.test(value)) {
      reasons.push(`${column} looks like a phone number; personal details are not kept in results`);
    }
    if (/[A-Za-z]:\\Users\\/i.test(value)) {
      reasons.push(
        `${column} contains a home folder path; keep raw files outside the repository with a neutral name`,
      );
    }
  }
  return reasons;
}

function checkCompletedMarks(measure: SupportedMeasure, raw: Record<string, string>): string[] {
  const reasons: string[] = [];
  const chain = REQUIRED_CHAIN[measure];
  const marks = marksFrom(raw);
  for (const mark of chain) {
    const value = marks[mark];
    if (value === undefined) {
      reasons.push(`completed ${measure} is missing mark ${mark}`);
    } else if (!Number.isFinite(value) || value < 0) {
      reasons.push(`mark ${mark} must be a finite, non-negative number of milliseconds`);
    }
  }
  if (reasons.length > 0) {
    return reasons;
  }
  for (let index = 1; index < chain.length; index += 1) {
    const from = chain[index - 1];
    const to = chain[index];
    if (from === undefined || to === undefined) {
      continue;
    }
    try {
      intervalMs(marks, from, to);
    } catch {
      reasons.push(`mark ${to} is earlier than ${from}`);
    }
  }
  return reasons;
}

function checkFailedRow(raw: Record<string, string>): string[] {
  const reasons: string[] = [];
  if ((raw.notes ?? "") === "") {
    reasons.push("failed tries need notes saying what failed");
  }
  for (const column of Object.keys(COLUMN_MARKS)) {
    const text = raw[column] ?? "";
    if (text === "") {
      continue;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) {
      reasons.push(`${column} must be a finite, non-negative number of milliseconds`);
    }
  }
  return reasons;
}

function marksFrom(raw: Record<string, string>): Marks {
  const marks: { -readonly [K in MarkName]?: number } = {};
  for (const [column, mark] of Object.entries(COLUMN_MARKS)) {
    const text = raw[column] ?? "";
    if (text !== "") {
      marks[mark] = Number(text);
    }
  }
  return marks;
}

function toRecord(raw: Record<string, string>): MeasurementRecord {
  return {
    measurementId: raw.measurement_id ?? "",
    measure: raw.measure as SupportedMeasure,
    outcome: raw.outcome as Outcome,
    language: raw.language as Language,
    trial: Number(raw.trial),
    evidenceLevel: raw.evidence_level as ImportableEvidenceLevel,
    timingSource: raw.timing_source as TimingSource,
    runByRole: raw.run_by_role as RunByRole,
    dateUtc: raw.date_utc ?? "",
    deviceModel: raw.device_model ?? "",
    osVersion: raw.os_version ?? "",
    appBuild: raw.app_build ?? "",
    appCommit: raw.app_commit ?? "",
    easBuildId: raw.eas_build_id ?? "",
    networkType: raw.network_type as NetworkType,
    provider: raw.provider ?? "",
    sampleSet: raw.sample_set ?? "",
    marks: marksFrom(raw),
    batteryStartPct: raw.battery_start_pct ?? "",
    rawLocation: raw.raw_location ?? "",
    notes: raw.notes ?? "",
  };
}

function recordToFields(record: MeasurementRecord): string[] {
  const markText = (mark: MarkName): string => {
    const value = record.marks[mark];
    return value === undefined ? "" : String(value);
  };
  return [
    record.measurementId,
    record.measure,
    record.outcome,
    record.language,
    String(record.trial),
    record.evidenceLevel,
    record.timingSource,
    record.runByRole,
    record.dateUtc,
    record.deviceModel,
    record.osVersion,
    record.appBuild,
    record.appCommit,
    record.easBuildId,
    record.networkType,
    record.provider,
    record.sampleSet,
    markText("capture"),
    markText("phone_received"),
    markText("first_words"),
    markText("first_sentence"),
    markText("speech_start"),
    markText("stop_press"),
    markText("speech_stopped"),
    record.batteryStartPct,
    record.rawLocation,
    record.notes,
  ];
}

/** Summary of accepted completed-or-failed tries, one entry per evidence level, measure and language. */
export interface EvidenceSummary {
  readonly evidenceLevel: ImportableEvidenceLevel;
  readonly timingSource: TimingSource;
  readonly measure: SupportedMeasure;
  readonly report: LanguageReport;
  /** Null when the documents set no criterion for the measure (capture to phone is reported only). */
  readonly criterionMet: boolean | null;
}

/**
 * Groups accepted records by evidence level and measure. Simulator and emulator rows are never mixed into
 * real-phone results: each evidence level is reported on its own.
 */
export function summarizeEvidence(records: readonly MeasurementRecord[]): EvidenceSummary[] {
  const groups = new Map<string, MeasurementRecord[]>();
  for (const record of records) {
    const key = `${record.evidenceLevel}|${record.timingSource}|${record.measure}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const summaries: EvidenceSummary[] = [];
  for (const level of IMPORTABLE_EVIDENCE_LEVELS) {
    for (const timingSource of IMPORTABLE_TIMING_SOURCES) {
      for (const measure of SUPPORTED_MEASURES) {
        const group = groups.get(`${level}|${timingSource}|${measure}`);
        if (group === undefined) {
          continue;
        }
        for (const report of reportsFor(measure, group.map(toAttempt))) {
          if (report.attempts === 0) {
            continue;
          }
          summaries.push({
            evidenceLevel: level,
            timingSource,
            measure,
            report,
            criterionMet: criterionFor(measure, report),
          });
        }
      }
    }
  }
  return summaries;
}

function toAttempt(record: MeasurementRecord): MeasuredAttempt {
  return {
    language: record.language,
    completed: record.outcome === "completed",
    marks: record.marks,
  };
}

function reportsFor(
  measure: SupportedMeasure,
  attempts: readonly MeasuredAttempt[],
): LanguageReport[] {
  switch (measure) {
    case "capture_to_phone":
      return captureToPhoneReport(attempts);
    case "latency_total":
      return latencyTotalReport(attempts);
    case "interruption":
      return interruptionReport(attempts);
  }
}

function criterionFor(measure: SupportedMeasure, report: LanguageReport): boolean | null {
  switch (measure) {
    case "capture_to_phone":
      return null;
    case "latency_total":
      return latencyCriterionMet(report);
    case "interruption":
      return interruptionCriterionMet(report);
  }
}

function isSupportedMeasure(value: string): value is SupportedMeasure {
  return (SUPPORTED_MEASURES as readonly string[]).includes(value);
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function isPercent(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) {
    return false;
  }
  return Number(value) <= 100;
}
