import { importMeasurementCsv, summarizeEvidence } from "@lensmate/core";
import {
  CAPTURE_TRIGGER_ACTION,
  CaptureToPhoneRecorder,
  type RecorderContext,
} from "./measurement-recorder";
import { createVirtualGlasses } from "./virtual-glasses-link";

/**
 * Simulator dry run of the capture-to-phone procedure (Goal 14.2). It exercises the harness, the export and
 * the import validator. It is NOT a physical-iPhone measurement: its evidence level is "simulator", and its
 * timings measure the simulator in Node, not glasses or phone latency.
 */
const DRY_RUN_CONTEXT: RecorderContext = {
  runId: "dryrun-sim-001",
  evidenceLevel: "simulator",
  runByRole: "agent",
  deviceModel: "virtual glasses simulator (no phone)",
  osVersion: "not applicable",
  appBuild: "dev",
  appCommit: "local-dry-run",
  easBuildId: "",
  networkType: "simulated",
  provider: "none",
  sampleSet: "scripted button presses (no audio, no images)",
  batteryStartPct: "",
};

const TRIES_PER_LANGUAGE = 50;

describe("simulator dry run: capture to phone", () => {
  it("records 50 tries per language, exports them, and passes the import validator", async () => {
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

    const result = importMeasurementCsv(recorder.exportCsv());
    expect(result.fileErrors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2 * TRIES_PER_LANGUAGE);
    expect(result.accepted.every((record) => record.evidenceLevel === "simulator")).toBe(true);
    expect(result.accepted.every((record) => record.runByRole === "agent")).toBe(true);

    const summaries = summarizeEvidence(result.accepted);
    const english = summaries.find((summary) => summary.report.language === "en");
    const telugu = summaries.find((summary) => summary.report.language === "te");
    expect(english?.report.attempts).toBe(TRIES_PER_LANGUAGE);
    expect(telugu?.report.attempts).toBe(TRIES_PER_LANGUAGE);
    expect(english?.report.measured).toBe(TRIES_PER_LANGUAGE);
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
  });
});
