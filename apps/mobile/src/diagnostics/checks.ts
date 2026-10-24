import type { BrokerConfig } from "../broker-config";
import type { NotifyPermission } from "../notify/local";

/**
 * Capability checks for the in-app diagnostics screen. Each check reports what this build and phone can do right now,
 * with a reason. Checks never call the AI broker, never start the camera or microphone, and never send a notification.
 * The screen supplies the real values; tests supply stand-ins.
 */
/** configured: the setting is present, but nothing was tested (no call, no camera, no sound). */
export type CheckStatus = "configured" | "ok" | "off" | "unavailable" | "needs_device";

export interface CheckResult {
  readonly id: "broker" | "camera" | "speech-output" | "speech-input" | "notifications" | "memory";
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface DiagnosticsInputs {
  readonly broker: BrokerConfig;
  readonly cameraAvailable: boolean;
  readonly speechOutputAvailable: boolean;
  readonly speechInputEnabled: boolean;
  readonly notifications: NotifyPermission;
  /** "encrypted" when the store opened, or the reason it refused (the fixed code from the memory module). */
  readonly memory: "encrypted" | "web" | "NOT_ENCRYPTED" | "KEY_LOST" | "UNAVAILABLE" | "FAILED";
  readonly platform: "ios" | "android" | "web";
}

function brokerResult(broker: BrokerConfig): CheckResult {
  if (broker.ok) {
    return {
      id: "broker",
      label: "AI broker address",
      status: "configured",
      detail: `Configured: ${broker.baseUrl}. Calls are still mock-mode unless the broker is set to live.`,
    };
  }
  switch (broker.reason) {
    case "NOT_CONFIGURED":
      return {
        id: "broker",
        label: "AI broker address",
        status: "off",
        detail: "No broker address is set. The app uses mock answers.",
      };
    case "INSECURE":
      return {
        id: "broker",
        label: "AI broker address",
        status: "unavailable",
        detail:
          "Plain HTTP is refused for this address. Use HTTPS (see docs/decisions/0003-iphone-broker-https-route.md).",
      };
    default:
      return {
        id: "broker",
        label: "AI broker address",
        status: "unavailable",
        detail: "The broker address is not a valid URL.",
      };
  }
}

function memoryResult(memory: DiagnosticsInputs["memory"]): CheckResult {
  switch (memory) {
    case "encrypted":
      return {
        id: "memory",
        label: "Encrypted notes",
        status: "ok",
        detail: "Notes open with the encrypted store.",
      };
    case "web":
      return {
        id: "memory",
        label: "Encrypted notes",
        status: "ok",
        detail: "Browser notes use the encrypted browser vault.",
      };
    case "NOT_ENCRYPTED":
      return {
        id: "memory",
        label: "Encrypted notes",
        status: "needs_device",
        detail:
          "Needs the LensMate development build. Expo Go cannot open the encrypted database, so nothing is saved.",
      };
    case "KEY_LOST":
      return {
        id: "memory",
        label: "Encrypted notes",
        status: "unavailable",
        detail:
          "Saved notes cannot be opened because their key is missing. Delete everything to start again.",
      };
    default:
      return {
        id: "memory",
        label: "Encrypted notes",
        status: "unavailable",
        detail: "Notes are unavailable on this device right now.",
      };
  }
}

/** Builds the full list, in the order the screen shows it. */
export function collectDiagnostics(inputs: DiagnosticsInputs): CheckResult[] {
  const notify = inputs.notifications;
  return [
    brokerResult(inputs.broker),
    {
      id: "camera",
      label: "Camera",
      status: inputs.cameraAvailable
        ? inputs.platform === "web"
          ? "configured"
          : "needs_device"
        : "unavailable",
      detail: inputs.cameraAvailable
        ? inputs.platform === "web"
          ? "The browser supports camera access (needs HTTPS or localhost). Permission is asked when you open See."
          : "Permission is asked when you open See. Check on the phone."
        : "This browser has no camera access.",
    },
    {
      id: "speech-output",
      label: "Spoken answers",
      status: inputs.speechOutputAvailable ? "needs_device" : "unavailable",
      detail: inputs.speechOutputAvailable
        ? "The device's voice engine reads answers aloud. Audible output needs a phone check."
        : "This browser has no speech output.",
    },
    {
      id: "speech-input",
      label: "Voice questions",
      status: inputs.speechInputEnabled ? "needs_device" : "off",
      detail: inputs.speechInputEnabled
        ? "Enabled. On-device recognition must be verified on the phone."
        : "Off in this build. Voice input needs the development build and on-device checks; no audio leaves the phone.",
    },
    {
      id: "notifications",
      label: "Notifications",
      status:
        notify === "granted" ? "needs_device" : notify === "unsupported" ? "unavailable" : "off",
      detail:
        notify === "granted"
          ? "Allowed. Delivery with the app closed needs a phone check."
          : notify === "denied"
            ? "Refused. Turn them on in the phone's Settings."
            : notify === "unsupported"
              ? "Not available in the browser."
              : "Not allowed yet. Use the Notification test on Profile to ask.",
    },
    memoryResult(inputs.memory),
  ];
}
