import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCsvLine, parseCsv } from "./csv.js";
import {
  MEASUREMENT_COLUMNS,
  importMeasurementCsv,
  serializeMeasurementCsv,
  summarizeEvidence,
} from "./import.js";
import { DRY_RUN_COMMIT_MARKER } from "./targets.js";

type Fields = Partial<Record<(typeof MEASUREMENT_COLUMNS)[number], string>>;

/** A valid simulator capture-to-phone try. Tests change one field at a time. */
const VALID_SIM_CAPTURE: Fields = {
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
  os_version: "node 22",
  app_build: "dev-4a78a51",
  app_commit: "4a78a51",
  eas_build_id: "",
  network_type: "simulated",
  provider: "none",
  sample_set: "scripted button presses",
  t_capture_ms: "1000",
  t_phone_received_ms: "1012",
  t_first_words_ms: "",
  t_first_sentence_ms: "",
  t_speech_start_ms: "",
  t_stop_press_ms: "",
  t_speech_stopped_ms: "",
  battery_start_pct: "",
  raw_location: "",
  notes: "",
};

/** A valid owner-run real-phone try, as the owner would enter it. */
const VALID_REAL_CAPTURE: Fields = {
  ...VALID_SIM_CAPTURE,
  measurement_id: "iph15-en-cap-001",
  evidence_level: "real phone",
  timing_source: "same_clock_simulator",
  run_by_role: "owner",
  device_model: "iPhone 15",
  os_version: "iOS 26.0",
  app_build: "build 12",
  app_commit: "f4b7db6",
  eas_build_id: "00000000-0000-0000-0000-000000000000",
  network_type: "wifi",
  provider: "none",
  sample_set: "fixed phrase list P1-EN-01",
  battery_start_pct: "80",
};

function csvOf(rows: readonly Fields[], header: readonly string[] = MEASUREMENT_COLUMNS): string {
  const lines = [formatCsvLine(header)];
  for (const row of rows) {
    lines.push(formatCsvLine(header.map((column) => row[column as keyof Fields] ?? "")));
  }
  return `${lines.join("\n")}\n`;
}

function reasonsFor(row: Fields): string[] {
  const result = importMeasurementCsv(csvOf([row]));
  expect(result.fileErrors).toEqual([]);
  expect(result.accepted).toHaveLength(0);
  expect(result.rejected).toHaveLength(1);
  return [...(result.rejected[0]?.reasons ?? [])];
}

describe("file-level checks", () => {
  it("accepts a valid simulator row", () => {
    const result = importMeasurementCsv(csvOf([VALID_SIM_CAPTURE]));
    expect(result.fileErrors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.marks).toEqual({ capture: 1000, phone_received: 1012 });
  });

  it("rejects an empty file", () => {
    expect(importMeasurementCsv("").fileErrors).toEqual(["file is empty"]);
  });

  it("rejects a file that is missing a template column", () => {
    const header = MEASUREMENT_COLUMNS.filter((column) => column !== "sample_set");
    const result = importMeasurementCsv(csvOf([], header));
    expect(result.fileErrors).toEqual(["missing column sample_set"]);
    expect(result.accepted).toEqual([]);
  });

  it("rejects a file with an unknown column, so a typo cannot silently drop a field", () => {
    const header = [...MEASUREMENT_COLUMNS, "devise_model"];
    const result = importMeasurementCsv(csvOf([], header));
    expect(result.fileErrors).toEqual(["unknown column devise_model"]);
  });

  it("rejects a row with the wrong number of fields", () => {
    const text = `${formatCsvLine(MEASUREMENT_COLUMNS)}\nsim-1,capture_to_phone\n`;
    const result = importMeasurementCsv(text);
    expect(result.rejected[0]?.reasons[0]).toMatch(
      new RegExp(`expected ${String(MEASUREMENT_COLUMNS.length)} fields, found 2`),
    );
  });

  it("rejects a file with an unterminated quote", () => {
    const result = importMeasurementCsv(`${formatCsvLine(MEASUREMENT_COLUMNS)}\n"open`);
    expect(result.fileErrors[0]).toMatch(/unterminated/);
  });
});

describe("provenance", () => {
  it.each([
    "device_model",
    "os_version",
    "app_build",
    "app_commit",
    "provider",
    "sample_set",
    "date_utc",
  ] as const)("rejects a row with an empty %s", (column) => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, [column]: "" })).toContain(
      `missing provenance field ${column}`,
    );
  });

  it.each([
    ["run_by_role", "run_by_role must be owner or agent"],
    ["evidence_level", 'unknown evidence_level ""'],
    ["language", "language must be one of en, te, hi, mixed"],
    ["network_type", "network_type must be one of wifi, cellular, none, simulated"],
  ] as const)(
    "rejects a row with an empty %s, so who ran it and the rest are never guessed",
    (column, reason) => {
      expect(reasonsFor({ ...VALID_SIM_CAPTURE, [column]: "" })).toContain(reason);
    },
  );

  it("rejects an unknown network type", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, network_type: "satellite" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/network_type must be one of/)]),
    );
  });

  it("rejects a date that is not ISO 8601 UTC", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, date_utc: "24/10/2026" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/date_utc must be an ISO 8601 UTC time/)]),
    );
  });

  it("rejects a battery value outside 0 to 100", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, battery_start_pct: "101" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/battery_start_pct/)]),
    );
  });

  it("accepts a row with no battery value", () => {
    expect(
      importMeasurementCsv(csvOf([{ ...VALID_SIM_CAPTURE, battery_start_pct: "" }])).accepted,
    ).toHaveLength(1);
  });

  it("rejects a trial number that is not a positive whole number", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, trial: "0" })).toContain(
      "trial must be a positive whole number",
    );
  });

  it("rejects an unknown language", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, language: "fr" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/language must be one of/)]),
    );
  });
});

describe("evidence-level claims", () => {
  it("accepts a valid owner-run real phone row", () => {
    expect(importMeasurementCsv(csvOf([VALID_REAL_CAPTURE])).accepted).toHaveLength(1);
  });

  it("rejects a real phone claim made by the agent", () => {
    expect(reasonsFor({ ...VALID_REAL_CAPTURE, run_by_role: "agent" })).toContain(
      "real phone evidence must be run by the owner; the agent never runs tests on the owner's phone",
    );
  });

  it("rejects a real phone claim whose device is a simulator or emulator", () => {
    expect(reasonsFor({ ...VALID_REAL_CAPTURE, device_model: "iPhone 15 Simulator" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/contradicts device_model/)]),
    );
  });

  it("rejects a real phone row that carries the dry-run commit marker, even with edited evidence", () => {
    expect(reasonsFor({ ...VALID_REAL_CAPTURE, app_commit: DRY_RUN_COMMIT_MARKER })).toEqual([
      expect.stringMatching(/cannot come from a dry run/),
    ]);
  });

  it("rejects a real phone row whose run ID carries the dry-run prefix", () => {
    expect(
      reasonsFor({ ...VALID_REAL_CAPTURE, measurement_id: "dryrun-sim-001-en-cap-001" }),
    ).toEqual([expect.stringMatching(/cannot come from a dry run/)]);
  });

  it("keeps a dry run row that is labelled simulator, the only label a dry run may carry", () => {
    const simulatorDryRun = {
      ...VALID_SIM_CAPTURE,
      measurement_id: "dryrun-sim-001-en-cap-001",
      app_commit: DRY_RUN_COMMIT_MARKER,
    };
    expect(importMeasurementCsv(csvOf([simulatorDryRun])).accepted).toHaveLength(1);
  });

  it("rejects a real phone row without the EAS build that produced the app", () => {
    expect(reasonsFor({ ...VALID_REAL_CAPTURE, eas_build_id: "" })).toContain(
      "real phone evidence needs eas_build_id",
    );
  });

  it("rejects hardware evidence levels, which no software measurement can reach", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, evidence_level: "bench hardware" })).toEqual([
      'evidence_level "bench hardware" is above what the import accepts (simulator, emulator, real phone)',
    ]);
  });

  it("rejects an evidence level that is not in the list", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, evidence_level: "lab grade" })).toEqual([
      'unknown evidence_level "lab grade"',
    ]);
  });
});

describe("measures and marks", () => {
  it("rejects a measure that is not instrumented yet", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, measure: "speech_accuracy" })).toEqual([
      'measure "speech_accuracy" is not instrumented or not supported by this import',
    ]);
  });

  it("rejects a completed end-to-end try with a missing mark", () => {
    const row: Fields = {
      ...VALID_SIM_CAPTURE,
      measure: "latency_total",
      t_phone_received_ms: "",
      t_first_words_ms: "1100",
      t_first_sentence_ms: "1300",
      t_speech_start_ms: "1800",
    };
    expect(reasonsFor(row)).toEqual(["completed latency_total is missing mark phone_received"]);
  });

  it("rejects marks that run backwards", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, t_phone_received_ms: "900" })).toEqual([
      "mark phone_received is earlier than capture",
    ]);
  });

  it("rejects a negative or non-numeric mark", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, t_capture_ms: "-5" })).toEqual([
      "mark capture must be a finite, non-negative number of milliseconds",
    ]);
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, t_capture_ms: "soon" })).toEqual([
      "mark capture must be a finite, non-negative number of milliseconds",
    ]);
  });

  it("accepts a failed try with notes and no marks", () => {
    const result = importMeasurementCsv(
      csvOf([
        {
          ...VALID_SIM_CAPTURE,
          outcome: "failed",
          t_phone_received_ms: "",
          notes: "phone link dropped",
        },
      ]),
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.outcome).toBe("failed");
  });

  it("rejects a failed try with no notes saying what failed", () => {
    expect(
      reasonsFor({ ...VALID_SIM_CAPTURE, outcome: "failed", t_phone_received_ms: "" }),
    ).toEqual(["failed tries need notes saying what failed"]);
  });

  it("rejects an unknown outcome", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, outcome: "maybe" })).toEqual([
      "outcome must be one of completed, failed",
    ]);
  });
});

describe("identifiers and personal data", () => {
  it("rejects the second row that reuses a measurement_id, and keeps the first", () => {
    const result = importMeasurementCsv(
      csvOf([VALID_SIM_CAPTURE, { ...VALID_SIM_CAPTURE, trial: "2" }]),
    );
    expect(result.accepted.map((record) => record.trial)).toEqual([1]);
    expect(result.rejected).toEqual([
      {
        line: 3,
        measurementId: "sim-en-cap-001",
        reasons: ["duplicate measurement_id sim-en-cap-001"],
      },
    ]);
  });

  it("rejects a missing measurement_id", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, measurement_id: "" })).toContain(
      "missing measurement_id",
    );
  });

  it("rejects an email address in notes", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, notes: "ran by someone@example.com" })).toEqual([
      "notes looks like an email address; personal details are not kept in results",
    ]);
  });

  it("rejects a phone-like number in a free-text field", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, notes: "call 9876543210" })).toEqual([
      "notes looks like a phone number; personal details are not kept in results",
    ]);
  });

  it("rejects a home folder path in raw_location", () => {
    expect(
      reasonsFor({ ...VALID_SIM_CAPTURE, raw_location: "C:\\Users\\Someone\\video.mp4" }),
    ).toEqual([
      "raw_location contains a home folder path; keep raw files outside the repository with a neutral name",
    ]);
  });

  it("does not mistake a date or a timing value for a phone number", () => {
    expect(importMeasurementCsv(csvOf([VALID_SIM_CAPTURE])).rejected).toEqual([]);
  });
});

describe("documented template", () => {
  it("keeps the header of docs/measurements/evidence-template.csv identical to the validator columns", () => {
    const templatePath = resolve(__dirname, "../../../../docs/measurements/evidence-template.csv");
    const rows = parseCsv(readFileSync(templatePath, "utf8"));
    expect(rows[0]).toEqual([...MEASUREMENT_COLUMNS]);
    expect(rows).toHaveLength(1);
  });
});

describe("summaries and round trip", () => {
  it("keeps simulator and real phone results apart", () => {
    const sim = { ...VALID_SIM_CAPTURE, measurement_id: "sim-a", trial: "1" };
    const real = { ...VALID_REAL_CAPTURE, measurement_id: "real-a", trial: "1" };
    const result = importMeasurementCsv(csvOf([sim, real]));
    const summaries = summarizeEvidence(result.accepted);
    expect(summaries.map((summary) => summary.evidenceLevel)).toEqual(["simulator", "real phone"]);
    for (const summary of summaries) {
      expect(summary.report.attempts).toBe(1);
      expect(summary.criterionMet).toBeNull();
    }
  });

  it("serializes accepted records back into a file that imports again unchanged", () => {
    const first = importMeasurementCsv(csvOf([VALID_SIM_CAPTURE, VALID_REAL_CAPTURE]));
    const text = serializeMeasurementCsv(first.accepted);
    const second = importMeasurementCsv(text);
    expect(second.rejected).toEqual([]);
    expect(second.accepted).toEqual(first.accepted);
  });
});

describe("timing source", () => {
  it("rejects a row with no timing source", () => {
    expect(reasonsFor({ ...VALID_SIM_CAPTURE, timing_source: "" })).toEqual([
      "missing timing_source",
    ]);
  });

  it("rejects a transport timing source until clock synchronization is validated", () => {
    expect(reasonsFor({ ...VALID_REAL_CAPTURE, timing_source: "ble_glasses_clock" })).toEqual([
      'timing_source "ble_glasses_clock" is not supported: transport timing needs a validated clock synchronization, which the app does not have yet',
    ]);
  });

  it("reports same-clock simulator timing apart from any other timing source", () => {
    const result = importMeasurementCsv(
      csvOf([VALID_SIM_CAPTURE, { ...VALID_REAL_CAPTURE, trial: "1" }]),
    );
    const summaries = summarizeEvidence(result.accepted);
    expect(new Set(summaries.map((summary) => summary.timingSource))).toEqual(
      new Set(["same_clock_simulator"]),
    );
    expect(summaries.map((summary) => summary.evidenceLevel).sort()).toEqual([
      "real phone",
      "simulator",
    ]);
  });
});
