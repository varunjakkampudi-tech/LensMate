import { MEASUREMENT_COLUMNS, serializeMeasurementCsv, importMeasurementCsv } from "@lensmate/core";
import { runImport } from "./cli";

function header(): string {
  return `${MEASUREMENT_COLUMNS.join(",")}\n`;
}

const SIM_VALUES: Record<string, string> = {
  measurement_id: "sim-en-cap-001",
  measure: "capture_to_phone",
  outcome: "completed",
  language: "en",
  trial: "1",
  evidence_level: "simulator",
  timing_source: "same_clock_simulator",
  run_by_role: "agent",
  date_utc: "2026-10-24T10:00:00Z",
  device_model: "virtual glasses simulator (no phone)",
  os_version: "not applicable",
  app_build: "dev",
  app_commit: "local",
  network_type: "simulated",
  provider: "none",
  sample_set: "scripted presses",
  t_capture_ms: "1000",
  t_phone_received_ms: "1012",
};

/** One row in template column order. Columns not listed above are empty. */
const SIM_ROW = MEASUREMENT_COLUMNS.map((column) => SIM_VALUES[column] ?? "").join(",");

describe("runImport", () => {
  it("exits 0 and reports a clean simulator file", () => {
    const run = runImport(`${header()}${SIM_ROW}\n`, "sim.csv");
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.report) as {
      accepted: number;
      rejected: unknown[];
      summaries: unknown[];
    };
    expect(report.accepted).toBe(1);
    expect(report.rejected).toEqual([]);
    expect(report.summaries).toHaveLength(1);
  });

  it("exits 1 and lists the rejected row when provenance is missing", () => {
    const broken = SIM_ROW.replace("virtual glasses simulator (no phone)", "");
    const run = runImport(`${header()}${broken}\n`, "broken.csv");
    expect(run.exitCode).toBe(1);
    const report = JSON.parse(run.report) as { rejected: { reasons: string[] }[] };
    expect(report.rejected[0]?.reasons).toContain("missing provenance field device_model");
  });

  it("exits 1 for a file with a missing column", () => {
    const run = runImport("measurement_id,measure\n", "short.csv");
    expect(run.exitCode).toBe(1);
    const report = JSON.parse(run.report) as { fileErrors: string[] };
    expect(report.fileErrors).toContain("missing column outcome");
  });

  it("round trips the serializer output used by the app export", () => {
    const first = importMeasurementCsv(`${header()}${SIM_ROW}\n`);
    const run = runImport(serializeMeasurementCsv(first.accepted), "export.csv");
    expect(run.exitCode).toBe(0);
  });
});
