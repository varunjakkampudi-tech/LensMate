import {
  DRY_RUN_COMMIT_MARKER,
  DRY_RUN_RUN_ID_PREFIX,
  LANGUAGES,
  type ImportableEvidenceLevel,
  type Language,
  type MeasurementRecord,
  type NetworkType,
  type RunByRole,
} from "@lensmate/core";
import type { RecorderContext } from "./measurement-recorder";

/**
 * Pure rules for the measurement screen: which provenance is required, what each measure's status is, and how
 * tries are counted. No rendering here, so these rules are unit-tested directly.
 */

export const LANGUAGE_CHOICES: readonly { readonly value: Language; readonly label: string }[] = [
  { value: "en", label: "English" },
  { value: "te", label: "Telugu" },
  { value: "hi", label: "Hindi" },
  { value: "mixed", label: "Mixed speech" },
];

export const EVIDENCE_CHOICES: readonly {
  readonly value: ImportableEvidenceLevel;
  readonly label: string;
}[] = [
  { value: "simulator", label: "Simulator" },
  { value: "emulator", label: "Emulator" },
  { value: "real phone", label: "Real phone" },
];

export const RUN_BY_CHOICES: readonly { readonly value: RunByRole; readonly label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "agent", label: "Agent (dry run)" },
];

export const NETWORK_CHOICES: readonly { readonly value: NetworkType; readonly label: string }[] = [
  { value: "wifi", label: "Wi-Fi" },
  { value: "cellular", label: "Cellular" },
  { value: "none", label: "No network" },
  { value: "simulated", label: "Simulated" },
];

/**
 * Provenance typed or chosen by the operator. Choices start empty: nothing is assumed about who ran the test
 * or on what evidence level.
 */
export interface ProvenanceForm {
  readonly runId: string;
  readonly evidenceLevel: ImportableEvidenceLevel | null;
  readonly runByRole: RunByRole | null;
  readonly deviceModel: string;
  readonly osVersion: string;
  readonly appBuild: string;
  readonly appCommit: string;
  readonly easBuildId: string;
  readonly networkType: NetworkType | null;
  readonly provider: string;
  readonly sampleSet: string;
  readonly batteryStartPct: string;
}

export const EMPTY_PROVENANCE: ProvenanceForm = {
  runId: "",
  evidenceLevel: null,
  runByRole: null,
  deviceModel: "",
  osVersion: "",
  appBuild: "",
  appCommit: "",
  easBuildId: "",
  networkType: null,
  provider: "none",
  sampleSet: "",
  batteryStartPct: "",
};

/**
 * Problems that stop a session from starting. Each message names the field, so the operator can fix it. The
 * CSV validator applies the same rules again at export time.
 */
export function provenanceProblems(form: ProvenanceForm): string[] {
  const problems: string[] = [];
  if (form.runId.trim() === "") {
    problems.push("Run ID is missing");
  }
  if (form.evidenceLevel === null) {
    problems.push("Choose the evidence level");
  }
  if (form.runByRole === null) {
    problems.push("Choose who ran the test");
  }
  if (form.deviceModel.trim() === "") {
    problems.push("Device model is missing");
  }
  if (form.osVersion.trim() === "") {
    problems.push("OS version is missing");
  }
  if (form.appBuild.trim() === "") {
    problems.push("App build is missing");
  }
  if (form.appCommit.trim() === "") {
    problems.push("App commit is missing");
  }
  if (form.networkType === null) {
    problems.push("Choose the network type");
  }
  if (form.sampleSet.trim() === "") {
    problems.push("Sample set is missing");
  }
  if (form.evidenceLevel === "real phone") {
    if (form.runByRole !== "owner") {
      problems.push(
        "Real phone evidence must be run by the owner; the agent never runs tests on the owner's phone",
      );
    }
    if (form.easBuildId.trim() === "") {
      problems.push("Real phone evidence needs the EAS build ID");
    }
    if (/simulator|emulator|virtual/i.test(form.deviceModel)) {
      problems.push("Real phone evidence cannot use a simulator or emulator device name");
    }
    if (
      form.appCommit.trim() === DRY_RUN_COMMIT_MARKER ||
      form.runId.trim().startsWith(DRY_RUN_RUN_ID_PREFIX)
    ) {
      problems.push(
        "Real phone evidence cannot come from a dry run; change the run ID and app commit",
      );
    }
  }
  if (!isValidBattery(form.batteryStartPct.trim())) {
    problems.push("Battery must be a whole number from 0 to 100, or left empty");
  }
  return problems;
}

/** Empty, or a whole number from 0 to 100. */
function isValidBattery(value: string): boolean {
  if (value === "") {
    return true;
  }
  return /^\d{1,3}$/.test(value) && Number(value) <= 100;
}

/** Recorder context for a session. Call only when `provenanceProblems` is empty. */
export function toRecorderContext(form: ProvenanceForm): RecorderContext {
  if (form.evidenceLevel === null || form.runByRole === null || form.networkType === null) {
    throw new Error("provenance is incomplete; check provenanceProblems first");
  }
  return {
    runId: form.runId.trim(),
    evidenceLevel: form.evidenceLevel,
    runByRole: form.runByRole,
    deviceModel: form.deviceModel.trim(),
    osVersion: form.osVersion.trim(),
    appBuild: form.appBuild.trim(),
    appCommit: form.appCommit.trim(),
    easBuildId: form.easBuildId.trim(),
    networkType: form.networkType,
    provider: form.provider.trim() === "" ? "none" : form.provider.trim(),
    sampleSet: form.sampleSet.trim(),
    batteryStartPct: form.batteryStartPct.trim(),
  };
}

type MeasureStatus = "instrumented" | "not_instrumented";

export interface MeasureEntry {
  readonly measure: string;
  readonly label: string;
  readonly status: MeasureStatus;
  /** The target from the approved documents, as written there. Not a release guarantee. */
  readonly target: string;
  readonly note: string;
}

/** What the screen says about each measure. Anything not instrumented is shown as such, and never as a result. */
export const MEASURE_ENTRIES: readonly MeasureEntry[] = [
  {
    measure: "capture_to_phone",
    label: "Capture to phone",
    status: "instrumented",
    target: "300 ms or less (v9 section 6.4)",
    note: "Same-clock simulator timing only. It measures the in-app path, not transport latency.",
  },
  {
    measure: "latency_total",
    label: "Total short request",
    status: "not_instrumented",
    target:
      "Under 2500 ms; 50 requests per language; 90 percent meeting it (v9 section 6.4, Goal 14.2)",
    note: "No recognition, translation or speech output in the app yet.",
  },
  {
    measure: "interruption",
    label: "Interruption",
    status: "not_instrumented",
    target: "Stop within 500 ms in 95 percent of tries (G19)",
    note: "No speech output in the app yet, so there is no speech to stop.",
  },
  {
    measure: "speech_accuracy",
    label: "Speech accuracy (word error rate)",
    status: "not_instrumented",
    target: "Owner-set targets (v9 section 6.1)",
    note: "Needs speech recognition and owner sample sets.",
  },
  {
    measure: "translation",
    label: "Translation scripts",
    status: "not_instrumented",
    target: "Scripts in v9 section 12; native-speaker scoring",
    note: "No translation in the app yet.",
  },
  {
    measure: "spend",
    label: "Spend per request",
    status: "not_instrumented",
    target: "Projection against the monthly cap (Goal 14.2)",
    note: "No provider calls in the app. Needs BLOCKER-006.",
  },
];

export interface LanguageTally {
  readonly language: Language;
  readonly tries: number;
  readonly completed: number;
  readonly failed: number;
}

/** Counts of tries per language, straight from the recorded records. Zero when nothing was recorded. */
export function tallyTries(records: readonly MeasurementRecord[]): LanguageTally[] {
  return LANGUAGES.map((language) => {
    const mine = records.filter((record) => record.language === language);
    const completed = mine.filter((record) => record.outcome === "completed").length;
    return { language, tries: mine.length, completed, failed: mine.length - completed };
  });
}

export function languageLabel(language: Language): string {
  return LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;
}
