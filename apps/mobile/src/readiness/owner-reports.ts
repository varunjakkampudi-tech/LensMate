/**
 * Owner-reported iPhone results, kept as reported. These are NOT agent-verified, and no commit is recorded for them: the
 * owner did not name the build. They do not change any matrix status. A capability with an owner report still needs
 * the matrix's own evidence rules (real phone, recorded commit) before it can count as accepted.
 */
export interface OwnerReport {
  readonly date: string;
  readonly capability: string;
  readonly result: "pass" | "fail";
  readonly note: string;
  /** Always null here: the commit the owner tested was not recorded. */
  readonly commit: null;
}

export const OWNER_REPORTS: readonly OwnerReport[] = [
  {
    date: "2026-10-25",
    capability: "Expo Go opens LensMate by QR code",
    result: "pass",
    note: "Owner report, Expo Go on iPhone 15.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "Home, Simulator and Profile navigation",
    result: "pass",
    note: "Owner report.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "See: camera permission and live preview",
    result: "pass",
    note: "Owner report. Real camera preview on the phone.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "See: take photo captures and shows the image",
    result: "pass",
    note: "Owner report.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "See: upload opens the photo library",
    result: "pass",
    note: "Owner report.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "Talk: spoken answer is audible where supported",
    result: "pass",
    note: "Owner report. Interruption and language were not reported.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "Notifications: test arrives after 10 seconds",
    result: "pass",
    note: "Owner report. Lock-screen and killed-app delivery were not reported.",
    commit: null,
  },
  {
    date: "2026-10-25",
    capability: "Notification tap opens Memory",
    result: "pass",
    note: "Owner report. Cold-start tap was not reported separately.",
    commit: null,
  },
];
