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
    const record = () => Promise.resolve();
    const anchorOk = () => Promise.resolve();
    expect(await runAdmin(["revoke", "dev-2"], devices, NOW, record, anchorOk)).toBe(
      "revoked dev-2\n",
    );
    expect(await runAdmin(["list-devices"], devices, NOW)).toBe("dev-2  lost phone  REVOKED\n");
    expect(await runAdmin(["revoke", "missing"], devices, NOW, record, anchorOk)).toBe(
      "no device missing\n",
    );
  });

  it("refuses to revoke without the anchor, and changes nothing", async () => {
    const devices = new InMemoryDeviceStore();
    devices.seedDevice("dev-5", "not-a-real-device-secret-".repeat(3), "phone");
    await expect(runAdmin(["revoke", "dev-5"], devices, NOW)).rejects.toThrow(
      /BROKER_LEDGER_ANCHOR_FILE/,
    );
    expect(await runAdmin(["list-devices"], devices, NOW)).toBe("dev-5  phone  active\n");
  });

  it("explains usage for a missing argument or an unknown command", async () => {
    const devices = new InMemoryDeviceStore();
    expect(await runAdmin(["revoke"], devices, NOW)).toBe("usage: revoke <deviceId>\n");
    expect(await runAdmin(["unknown"], devices, NOW)).toBe(
      "usage: enrol-code | list-devices | revoke <deviceId>\n",
    );
  });
});

describe("revocation is recorded on the anchor", () => {
  it("calls the recorder with the revoked device id", async () => {
    const devices = new InMemoryDeviceStore();
    devices.seedDevice("dev-3", "not-a-real-device-secret-".repeat(3), "phone");
    const recorded: string[] = [];
    const output = await runAdmin(
      ["revoke", "dev-3"],
      devices,
      NOW,
      (id) => {
        recorded.push(id);
        return Promise.resolve();
      },
      () => Promise.resolve(),
    );
    expect(output).toBe("revoked dev-3\n");
    expect(recorded).toEqual(["dev-3"]);
  });

  it("does not report success when the anchor cannot record the revocation", async () => {
    const devices = new InMemoryDeviceStore();
    devices.seedDevice("dev-4", "not-a-real-device-secret-".repeat(3), "phone");
    await expect(
      runAdmin(
        ["revoke", "dev-4"],
        devices,
        NOW,
        () => Promise.reject(new Error("disk full")),
        () => Promise.resolve(),
      ),
    ).rejects.toThrow(/could not be recorded on the anchor/);
  });

  it("checks the anchor before the database changes, so a refused anchor revokes nothing", async () => {
    const devices = new InMemoryDeviceStore();
    devices.seedDevice("dev-6", "not-a-real-device-secret-".repeat(3), "phone");
    const recorded: string[] = [];
    await expect(
      runAdmin(
        ["revoke", "dev-6"],
        devices,
        NOW,
        (id) => {
          recorded.push(id);
          return Promise.resolve();
        },
        () => Promise.reject(new Error("mount refused")),
      ),
    ).rejects.toThrow(/nothing was revoked/);
    expect(recorded).toEqual([]);
    expect(await runAdmin(["list-devices"], devices, NOW)).toBe("dev-6  phone  active\n");
  });
});
