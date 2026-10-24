/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DRY_RUN_COMMIT_MARKER,
  DRY_RUN_RUN_ID_PREFIX,
  importMeasurementCsv,
  serializeMeasurementCsv,
  summarizeEvidence,
  type MeasurementRecord,
} from "@lensmate/core";
import {
  CAPTURE_TRIGGER_ACTION,
  CaptureToPhoneRecorder,
  type RecorderContext,
} from "./measurement-recorder";
import { createVirtualGlasses } from "./virtual-glasses-link";

/**
 * Simulator dry run of the capture-to-phone procedure (Goal 14.2). It exercises the harness, the export and
 * the import validator, and writes the validated CSV to measurement-output/ (ignored by git). It is NOT a
 * physical-iPhone measurement: its evidence level is "simulator", and its timings measure the simulator in Node,
 * not glasses or phone latency. The importer refuses any real phone row that carries the dry-run marker.
 */
const DRY_RUN_CONTEXT: RecorderContext = {
  runId: `${DRY_RUN_RUN_ID_PREFIX}sim-001`,
  evidenceLevel: "simulator",
  runByRole: "agent",
  deviceModel: "virtual glasses simulator (no phone)",
  osVersion: "not applicable",
  appBuild: "dev",
  appCommit: DRY_RUN_COMMIT_MARKER,
  easBuildId: "",
  networkType: "simulated",
  provider: "none",
  sampleSet: "scripted button presses (no audio, no images)",
  batteryStartPct: "",
};

const TRIES_PER_LANGUAGE = 50;
/** Repository root, ignored by git. The file name states the evidence level. */
const OUTPUT_DIR = resolve(__dirname, "../../../measurement-output");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "SIMULATOR-dry-run-capture_to_phone.csv");

describe("simulator dry run: capture to phone", () => {
  it("records 50 tries per language, writes a SIMULATOR-labelled CSV, and passes the import validator", async () => {
    const glasses = createVirtualGlasses();
    await glasses.connect();
    const recorder = new CaptureToPhoneRecorder(glasses, () => performance.now(), DRY_RUN_CONTEXT);
    recorder.start();

    for (const language of ["en", "te"] as const) {
      recorder.beginLanguage(language);
      for (let index = 0; index < TRIES_PER_LANGUAGE; index += 1) {
        glasses.pressButton(CAPTURE_TRIGGER_ACTION);
      }
    }
    recorder.stop();

    const csv = recorder.exportCsv();
    const result = importMeasurementCsv(csv);
    expect(result.fileErrors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2 * TRIES_PER_LANGUAGE);
    expect(result.accepted.every((record) => record.evidenceLevel === "simulator")).toBe(true);
    expect(result.accepted.every((record) => record.runByRole === "agent")).toBe(true);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, csv, "utf8");
    const written = importMeasurementCsv(readFileSync(OUTPUT_FILE, "utf8"));
    expect(written.rejected).toEqual([]);
    expect(written.accepted).toHaveLength(2 * TRIES_PER_LANGUAGE);

    const summaries = summarizeEvidence(result.accepted);
    const english = summaries.find((summary) => summary.report.language === "en");
    const telugu = summaries.find((summary) => summary.report.language === "te");
    expect(english?.report.attempts).toBe(TRIES_PER_LANGUAGE);
    expect(telugu?.report.attempts).toBe(TRIES_PER_LANGUAGE);
    expect(english?.report.measured).toBe(TRIES_PER_LANGUAGE);
  });

  it("refuses the dry-run rows as real phone evidence even when every label is edited", async () => {
    const glasses = createVirtualGlasses();
    await glasses.connect();
    const recorder = new CaptureToPhoneRecorder(glasses, () => performance.now(), DRY_RUN_CONTEXT);
    recorder.start();
    glasses.pressButton(CAPTURE_TRIGGER_ACTION);
    recorder.stop();

    const [tryRecord] = recorder.tries;
    expect(tryRecord).toBeDefined();
    const relabelled = serializeMeasurementCsv([
      {
        ...(tryRecord as MeasurementRecord),
        evidenceLevel: "real phone",
        runByRole: "owner",
        deviceModel: "iPhone 15",
        networkType: "wifi",
        easBuildId: "eas-build-1",
      },
    ]);
    const result = importMeasurementCsv(relabelled);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reasons).toEqual([
      expect.stringMatching(/cannot come from a dry run/),
    ]);
  });

  it("does not report latency_total or interruption, because those stages are not instrumented yet", async () => {
    const glasses = createVirtualGlasses();
    await glasses.connect();
    const recorder = new CaptureToPhoneRecorder(glasses, () => performance.now(), DRY_RUN_CONTEXT);
    recorder.start();
    glasses.pressButton(CAPTURE_TRIGGER_ACTION);
    recorder.stop();

    const result = importMeasurementCsv(recorder.exportCsv());
    const measures = new Set(summarizeEvidence(result.accepted).map((summary) => summary.measure));
    expect([...measures]).toEqual(["capture_to_phone"]);
    // The protocol has no speech, recognition or speech-output message (packages/protocol/proto), so the recorder
    // can only ever write the two capture marks. The speech marks stay absent until a speech pipeline exists.
    for (const record of recorder.tries) {
      expect(Object.keys(record.marks).sort()).toEqual(["capture", "phone_received"]);
    }
  });
});
