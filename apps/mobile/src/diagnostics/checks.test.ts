import { collectDiagnostics, type DiagnosticsInputs } from "./checks";

const BASE: DiagnosticsInputs = {
  broker: { ok: false, reason: "NOT_CONFIGURED" },
  cameraAvailable: true,
  speechOutputAvailable: true,
  speechInputEnabled: false,
  notifications: "undetermined",
  memory: "NOT_ENCRYPTED",
  platform: "ios",
};

function byId(inputs: DiagnosticsInputs, id: string) {
  const found = collectDiagnostics(inputs).find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`no check ${id}`);
  }
  return found;
}

describe("diagnostics checks", () => {
  it("lists every capability once, in order", () => {
    expect(collectDiagnostics(BASE).map((c) => c.id)).toEqual([
      "broker",
      "camera",
      "speech-output",
      "speech-input",
      "notifications",
      "memory",
    ]);
  });

  it("reports an unset broker as off, not as an error", () => {
    expect(byId(BASE, "broker")).toMatchObject({ status: "off" });
  });

  it("reports a configured HTTPS broker as ok and names it", () => {
    const r = byId({ ...BASE, broker: { ok: true, baseUrl: "https://broker.example" } }, "broker");
    expect(r.status).toBe("configured");
    expect(r.detail).toContain("https://broker.example");
  });

  it("refuses plain-HTTP broker addresses with the decision record to read", () => {
    const r = byId({ ...BASE, broker: { ok: false, reason: "INSECURE" } }, "broker");
    expect(r.status).toBe("unavailable");
    expect(r.detail).toMatch(/0003-iphone-broker-https-route/);
  });

  it("never reports the camera as working on the phone without a device check", () => {
    expect(byId(BASE, "camera").status).toBe("needs_device");
  });

  it("reports the browser camera as configured on web, and missing camera as unavailable", () => {
    expect(byId({ ...BASE, platform: "web" }, "camera").status).toBe("configured");
    expect(byId({ ...BASE, cameraAvailable: false }, "camera").status).toBe("unavailable");
  });

  it("keeps voice input off in this build, with the reason", () => {
    const r = byId(BASE, "speech-input");
    expect(r.status).toBe("off");
    expect(r.detail).toMatch(/no audio leaves the phone/);
  });

  it("marks notifications as needing a phone check only when they are granted", () => {
    expect(byId({ ...BASE, notifications: "granted" }, "notifications").status).toBe(
      "needs_device",
    );
    expect(byId({ ...BASE, notifications: "denied" }, "notifications").detail).toMatch(/Settings/);
    expect(byId({ ...BASE, notifications: "unsupported" }, "notifications").status).toBe(
      "unavailable",
    );
  });

  it("explains that Expo Go cannot open the encrypted notes store", () => {
    const r = byId(BASE, "memory");
    expect(r.status).toBe("needs_device");
    expect(r.detail).toMatch(/development build/);
  });

  it("reports a lost key without suggesting that data is safe", () => {
    expect(byId({ ...BASE, memory: "KEY_LOST" }, "memory")).toMatchObject({
      status: "unavailable",
    });
  });
});
