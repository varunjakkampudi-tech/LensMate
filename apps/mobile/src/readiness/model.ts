/**
 * Feature readiness: the types and the scoring policy. Entries come from FEATURE_MATRIX.md through
 * tools/readiness/generate.mjs. Nothing here sets a percentage by hand.
 *
 * SCORING POLICY (version 1)
 * - The percentage is the implementation estimate for the matrix status, from the table below. It is not a measured
 *   product score and it is never computed from CI results.
 * - No status reaches 100 percent. Full completion needs owner-run acceptance on the device the feature targets, which
 *   the matrix does not yet record for any feature.
 * - NOT_DUE rows (future phase) have no percentage and are never shown as ready.
 *
 * STATE shown to the owner
 * - Ready: Integrated with owner-run device evidence. No row has this yet, so no feature is shown as Ready.
 * - Partial: code or tests exist, or the matrix records it as waiting for the owner.
 * - Not started: specified only.
 * - Blocked: the matrix names a blocker that stops the work.
 * - Future: scheduled for a phase the active authorization does not cover (NOT_DUE).
 */
export const REGISTRY_POLICY_VERSION = 1;

type MatrixStatus =
  | "Specified"
  | "Unverified"
  | "Implemented"
  | "Tested"
  | "Measured"
  | "READY_FOR_OWNER"
  | "Hardware-pending"
  | "Blocked"
  | "Integrated"
  | "NOT_DUE";

export type ReadinessState = "Ready" | "Partial" | "Not started" | "Blocked" | "Future";

type EntryKind = "features" | "checklist";

export interface ReadinessEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: EntryKind;
  readonly v9Section: string;
  readonly tier: string;
  readonly phase: string;
  readonly p1Scope: boolean;
  readonly status: MatrixStatus;
  readonly evidence: string;
  readonly remaining: string;
  readonly blocker: string;
}

/** Implementation estimate per matrix status (percent). Explicit and reviewed; change only with a policy-version bump. */
const COMPLETION_BY_STATUS: Readonly<Record<Exclude<MatrixStatus, "NOT_DUE">, number>> = {
  Specified: 5,
  Unverified: 25,
  Implemented: 50,
  Tested: 70,
  READY_FOR_OWNER: 75,
  "Hardware-pending": 80,
  Measured: 90,
  Blocked: 0,
  Integrated: 95,
};

export function completionPercent(entry: ReadinessEntry): number | null {
  if (entry.status === "NOT_DUE") {
    return null;
  }
  return COMPLETION_BY_STATUS[entry.status];
}

export function stateOf(entry: ReadinessEntry): ReadinessState {
  switch (entry.status) {
    case "NOT_DUE":
      return "Future";
    case "Specified":
      return "Not started";
    case "Blocked":
      return "Blocked";
    case "Integrated":
      // Ready needs owner-run device evidence. The matrix records none yet, so this stays Partial until it is added.
      return /real phone|real device|native device/i.test(entry.evidence) ? "Ready" : "Partial";
    default:
      return "Partial";
  }
}

/** Evidence levels the policy recognises, from the matrix evidence rules. Anything else is reported as "unknown". */
const EVIDENCE_LEVELS = [
  "unit",
  "integration",
  "browser",
  "Expo Go",
  "simulator",
  "MOCK",
  "real phone",
  "bench hardware",
  "wearable prototype",
  "none",
] as const;

export function evidenceLevels(entry: ReadinessEntry): string[] {
  const text = entry.evidence.toLowerCase();
  const found = EVIDENCE_LEVELS.filter((level) => text.includes(level.toLowerCase()));
  return found.length === 0 ? ["unknown"] : found.filter((level) => level !== "none");
}
