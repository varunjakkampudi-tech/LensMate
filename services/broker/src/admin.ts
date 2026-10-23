import type { DeviceStore } from "./devices.js";
import { issueEnrolmentCode } from "./devices.js";

/**
 * Owner commands for devices (BLOCKER-006 item 3). Each command returns the text to print. The enrolment code is
 * printed once and never stored in clear. Device secrets are never printed, because the broker does not keep them.
 */
export async function runAdmin(
  args: readonly string[],
  devices: DeviceStore,
  nowMs: number,
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
      const ok = await devices.revokeDevice(argument);
      return ok ? `revoked ${argument}\n` : `no device ${argument}\n`;
    }
    default:
      return "usage: enrol-code | list-devices | revoke <deviceId>\n";
  }
}
