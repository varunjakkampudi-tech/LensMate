import { LANGUAGES, type MeasurementRecord } from "@lensmate/core";
import {
  EMPTY_PROVENANCE,
  MEASURE_ENTRIES,
  provenanceProblems,
  tallyTries,
  toRecorderContext,
  type ProvenanceForm,
} from "./measurement-session";

const COMPLETE_SIMULATOR: ProvenanceForm = {
  runId: "run-1",
  evidenceLevel: "simulator",
  runByRole: "agent",
  deviceModel: "virtual glasses simulator (no phone)",
  osVersion: "not applicable",
  appBuild: "dev",
  appCommit: "a075242",
  easBuildId: "",
  networkType: "simulated",
  provider: "none",
  sampleSet: "scripted presses",
  batteryStartPct: "",
};

const COMPLETE_REAL_PHONE: ProvenanceForm = {
  ...COMPLETE_SIMULATOR,
  evidenceLevel: "real phone",
  runByRole: "owner",
  deviceModel: "iPhone 15",
  osVersion: "iOS 26.0",
  easBuildId: "eas-build-1",
  networkType: "wifi",
  batteryStartPct: "80",
};

describe("provenanceProblems", () => {
  it("accepts a complete simulator form", () => {
    expect(provenanceProblems(COMPLETE_SIMULATOR)).toEqual([]);
  });

  it("accepts a complete owner real phone form with an EAS build ID", () => {
    expect(provenanceProblems(COMPLETE_REAL_PHONE)).toEqual([]);
  });

  it("starts with every required choice missing", () => {
    expect(provenanceProblems(EMPTY_PROVENANCE)).toEqual(
      expect.arrayContaining([
        "Run ID is missing",
        "Choose the evidence level",
        "Choose who ran the test",
        "Device model is missing",
        "OS version is missing",
        "App build is missing",
        "App commit is missing",
        "Choose the network type",
        "Sample set is missing",
      ]),
    );
  });

  it("treats whitespace-only text as missing", () => {
    expect(provenanceProblems({ ...COMPLETE_SIMULATOR, runId: "   " })).toEqual([
      "Run ID is missing",
    ]);
  });

  it("blocks real phone evidence run by the agent", () => {
    expect(provenanceProblems({ ...COMPLETE_REAL_PHONE, runByRole: "agent" })).toEqual([
      "Real phone evidence must be run by the owner; the agent never runs tests on the owner's phone",
    ]);
  });

  it("requires the EAS build ID for real phone evidence", () => {
    expect(provenanceProblems({ ...COMPLETE_REAL_PHONE, easBuildId: " " })).toEqual([
      "Real phone evidence needs the EAS build ID",
    ]);
  });

  it("blocks a real phone claim that names a simulator or emulator device", () => {
    expect(
      provenanceProblems({ ...COMPLETE_REAL_PHONE, deviceModel: "iPhone 15 Simulator" }),
    ).toEqual(["Real phone evidence cannot use a simulator or emulator device name"]);
  });

  it("rejects a battery value that is not a whole number from 0 to 100", () => {
    expect(provenanceProblems({ ...COMPLETE_SIMULATOR, batteryStartPct: "101" })).toEqual([
      "Battery must be a whole number from 0 to 100, or left empty",
    ]);
    expect(provenanceProblems({ ...COMPLETE_SIMULATOR, batteryStartPct: "80%" })).toEqual([
      "Battery must be a whole number from 0 to 100, or left empty",
    ]);
  });

  it("accepts an empty battery value", () => {
    expect(provenanceProblems({ ...COMPLETE_SIMULATOR, batteryStartPct: "" })).toEqual([]);
  });
});

describe("toRecorderContext", () => {
  it("trims text fields and defaults an empty provider to none", () => {
    const context = toRecorderContext({
      ...COMPLETE_SIMULATOR,
      runId: "  run-9  ",
      provider: " ",
      sampleSet: " set ",
    });
    expect(context.runId).toBe("run-9");
    expect(context.provider).toBe("none");
    expect(context.sampleSet).toBe("set");
  });

  it("refuses an incomplete form instead of guessing the missing choices", () => {
    expect(() => toRecorderContext(EMPTY_PROVENANCE)).toThrow(/provenance is incomplete/);
  });
});

describe("MEASURE_ENTRIES", () => {
  it("marks only capture to phone as instrumented", () => {
    const instrumented = MEASURE_ENTRIES.filter((entry) => entry.status === "instrumented").map(
      (entry) => entry.measure,
    );
    expect(instrumented).toEqual(["capture_to_phone"]);
  });

  it("marks every unsupported metric as not instrumented", () => {
    const notInstrumented = MEASURE_ENTRIES.filter(
      (entry) => entry.status === "not_instrumented",
    ).map((entry) => entry.measure);
    expect(notInstrumented).toEqual(
      expect.arrayContaining([
        "latency_total",
        "interruption",
        "speech_accuracy",
        "translation",
        "spend",
      ]),
    );
  });

  it("quotes the approved targets as written in the documents", () => {
    const total = MEASURE_ENTRIES.find((entry) => entry.measure === "latency_total");
    const interruption = MEASURE_ENTRIES.find((entry) => entry.measure === "interruption");
    expect(total?.target).toMatch(/Under 2500 ms; 50 requests per language; 90 percent/);
    expect(interruption?.target).toMatch(/500 ms in 95 percent/);
  });
});

describe("tallyTries", () => {
  function record(
    language: (typeof LANGUAGES)[number],
    outcome: "completed" | "failed",
  ): MeasurementRecord {
    return {
      measurementId: `${language}-${outcome}`,
      measure: "capture_to_phone",
      outcome,
      language,
      trial: 1,
      evidenceLevel: "simulator",
      timingSource: "same_clock_simulator",
      runByRole: "agent",
      dateUtc: "2026-10-24T10:00:00Z",
      deviceModel: "d",
      osVersion: "o",
      appBuild: "b",
      appCommit: "c",
      easBuildId: "",
      networkType: "simulated",
      provider: "none",
      sampleSet: "s",
      marks: {},
      batteryStartPct: "",
      rawLocation: "",
      notes: "",
    };
  }

  it("returns zero for every language when nothing is recorded", () => {
    expect(tallyTries([]).every((tally) => tally.tries === 0)).toBe(true);
  });

  it("counts completed and failed tries per language", () => {
    const tallies = tallyTries([
      record("te", "completed"),
      record("te", "failed"),
      record("hi", "completed"),
    ]);
    expect(tallies.find((tally) => tally.language === "te")).toEqual({
      language: "te",
      tries: 2,
      completed: 1,
      failed: 1,
    });
    expect(tallies.find((tally) => tally.language === "mixed")?.tries).toBe(0);
  });
});
