import type { BrokerConfig } from "../broker-config";

/**
 * Capability checks for the in-app diagnostics screen. Each check reports what this build and phone can do right now,
 * with a reason. Checks never call the AI broker or start the camera or microphone.
 * The screen supplies the real values; tests supply stand-ins.
 */
/** configured: the setting is present, but nothing was tested (no call, no camera, no sound). */
export type CheckStatus = "configured" | "ok" | "low" | "off" | "unavailable" | "needs_device";

export interface CheckResult {
  readonly id: "broker" | "camera" | "speech-output" | "speech-input" | "memory" | "battery";
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface DiagnosticsInputs {
  readonly broker: BrokerConfig;
  readonly cameraAvailable: boolean;
  readonly speechOutputAvailable: boolean;
  readonly speechInputEnabled: boolean;
  /** "encrypted" when the store opened, or the reason it refused (the fixed code from the memory module). */
  readonly memory: "encrypted" | "web" | "NOT_ENCRYPTED" | "KEY_LOST" | "UNAVAILABLE" | "FAILED";
  readonly platform: "ios" | "android" | "web";
  /** The battery level, when this phone or browser reports it. Null when it does not. */
  readonly battery: BatteryReading | null;
}

/** level is a fraction from 0 to 1. */
export interface BatteryReading {
  readonly level: number;
  readonly charging: boolean;
}

/** Below this level, and not charging, the check asks for a charge. */
const LOW_BATTERY_LEVEL = 0.2;

export function batteryResult(battery: BatteryReading | null): CheckResult {
  if (battery === null) {
    return {
      id: "battery",
      label: "Battery",
      status: "unavailable",
      detail: "This phone or browser does not report the battery level.",
    };
  }
  const percent = Math.round(battery.level * 100);
  if (!battery.charging && battery.level < LOW_BATTERY_LEVEL) {
    return {
      id: "battery",
      label: "Battery",
      status: "low",
      detail: `${String(percent)}% and not charging. Charge the phone soon.`,
    };
  }
  return {
    id: "battery",
    label: "Battery",
    status: "ok",
    detail: battery.charging ? `${String(percent)}%, charging.` : `${String(percent)}%.`,
  };
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
  return [
    brokerResult(inputs.broker),
    batteryResult(inputs.battery),
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
          ? "The browser supports camera access (needs HTTPS or localhost). Permission is asked when you open Capture."
          : "Permission is asked when you open Capture. Check on the phone."
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
    memoryResult(inputs.memory),
  ];
}
