import { runAdmin } from "./admin.js";
import { InMemoryDeviceStore } from "./devices.js";

const NOW = 1_800_000_000_000;

describe("owner admin commands", () => {
  it("prints a single-use enrolment code once", async () => {
    const devices = new InMemoryDeviceStore();
    const output = await runAdmin(["enrol-code"], devices, NOW);
    expect(output).toMatch(
      /^enrolment code \(single use, valid 10 minutes, shown once\): [A-Z2-9]{4}-/,
    );
  });

  it("lists devices without printing any secret", async () => {
    const devices = new InMemoryDeviceStore();
    expect(await runAdmin(["list-devices"], devices, NOW)).toBe("no devices enrolled\n");
    devices.seedDevice("dev-1", "not-a-real-device-secret-".repeat(3), "owner phone");
    const output = await runAdmin(["list-devices"], devices, NOW);
    expect(output).toBe("dev-1  owner phone  active\n");
    expect(output).not.toContain("not-a-real-device-secret");
  });

  it("revokes a device and shows it as revoked", async () => {
    const devices = new InMemoryDeviceStore();
    devices.seedDevice("dev-2", "not-a-real-device-secret-".repeat(3), "lost phone");
    expect(await runAdmin(["revoke", "dev-2"], devices, NOW)).toBe("revoked dev-2\n");
    expect(await runAdmin(["list-devices"], devices, NOW)).toBe("dev-2  lost phone  REVOKED\n");
    expect(await runAdmin(["revoke", "missing"], devices, NOW)).toBe("no device missing\n");
  });

  it("explains usage for a missing argument or an unknown command", async () => {
    const devices = new InMemoryDeviceStore();
    expect(await runAdmin(["revoke"], devices, NOW)).toBe("usage: revoke <deviceId>\n");
    expect(await runAdmin(["unknown"], devices, NOW)).toBe(
      "usage: enrol-code | list-devices | revoke <deviceId>\n",
    );
  });
});
