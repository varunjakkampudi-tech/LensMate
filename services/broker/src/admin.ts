import type { DeviceStore } from "./devices.js";
import { issueEnrolmentCode } from "./devices.js";

/**
 * Owner commands for devices (BLOCKER-006 item 3). Each command returns the text to print. The enrolment code is
 * printed once and never stored in clear. Device secrets are never printed, because the broker does not keep them.
 */
/** An owner-facing error. Its message is fixed text written by this module; it never includes a secret or a URL. */
export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

export async function runAdmin(
  args: readonly string[],
  devices: DeviceStore,
  nowMs: number,
  // Records a revocation on the spend anchor, so a restore cannot bring the device back unnoticed.
  onRevoked?: (deviceId: string) => Promise<void>,
): Promise<string> {
  const [command, argument] = args;
  switch (command) {
    case "enrol-code": {
      const code = await issueEnrolmentCode(devices, nowMs);
      return `enrolment code (single use, valid 10 minutes, shown once): ${code}\n`;
    }
    case "list-devices": {
      const list = await devices.listDevices();
      if (list.length === 0) {
        return "no devices enrolled\n";
      }
      return (
        list
          .map((d) => `${d.deviceId}  ${d.label}  ${d.revoked ? "REVOKED" : "active"}`)
          .join("\n") + "\n"
      );
    }
    case "revoke": {
      if (argument === undefined) {
        return "usage: revoke <deviceId>\n";
      }
      // Refuse before changing anything: a revocation the anchor does not record can be undone by a restore.
      if (onRevoked === undefined) {
        throw new AdminError(
          "revoke needs the anchor volume: set BROKER_LEDGER_ANCHOR_FILE. Nothing was revoked.",
        );
      }
      const ok = await devices.revokeDevice(argument);
      if (!ok) {
        return `no device ${argument}\n`;
      }
      try {
        await onRevoked(argument);
      } catch {
        throw new AdminError(
          "revoked in the database, but the revocation could not be recorded on the anchor; run revoke again",
        );
      }
      return `revoked ${argument}\n`;
    }
    default:
      return "usage: enrol-code | list-devices | revoke <deviceId>\n";
  }
}
