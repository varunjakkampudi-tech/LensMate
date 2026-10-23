#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { importMeasurementCsv, summarizeEvidence } from "@lensmate/core";

/**
 * Validates a P-1 measurement result file (Goal 14.2). It reads a CSV, rejects every row that lacks
 * provenance or makes a claim the evidence rules do not support, and prints a JSON report.
 *
 * Exit code 0 only when the file has no file-level errors and no rejected rows.
 * Simulator and emulator rows are reported separately from real phone rows.
 */
export interface ImportRun {
  readonly exitCode: number;
  readonly report: string;
}

export function runImport(text: string, fileName: string): ImportRun {
  const result = importMeasurementCsv(text);
  const clean = result.fileErrors.length === 0 && result.rejected.length === 0;
  const report = {
    file: fileName,
    accepted: result.accepted.length,
    rejected: result.rejected,
    fileErrors: result.fileErrors,
    summaries: summarizeEvidence(result.accepted).map((summary) => ({
      evidenceLevel: summary.evidenceLevel,
      measure: summary.measure,
      language: summary.report.language,
      attempts: summary.report.attempts,
      measured: summary.report.measured,
      passes: summary.report.passes,
      passPercent: summary.report.passPercent,
      criterionMet: summary.criterionMet,
    })),
  };
  return { exitCode: clean ? 0 : 1, report: `${JSON.stringify(report, null, 2)}\n` };
}

function main(argv: readonly string[]): number {
  const path = argv[0];
  if (path === undefined) {
    process.stderr.write("usage: lensmate-measure-import <results.csv>\n");
    return 2;
  }
  const run = runImport(readFileSync(path, "utf8"), path);
  process.stdout.write(run.report);
  return run.exitCode;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
