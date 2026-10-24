import { runAdmin } from "./admin.js";
import {
  ENROLMENT_CODE_TTL_MS,
  InMemoryDeviceStore,
  authenticateDevice,
  issueEnrolmentCode,
  newEnrolmentCode,
  normalizeCode,
  redeemEnrolment,
  sha256Hex,
} from "./devices.js";

const NOW = 1_800_000_000_000;
const DEVICE_SECRET = "device-secret-0123456789abcdefghijklmnop";
const DEVICE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("enrolment codes", () => {
  it("are 80-bit codes grouped in fours, from a 30-letter alphabet with no look-alike characters", () => {
    const { code } = newEnrolmentCode(NOW);
    expect(code).toMatch(
      /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}(-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}){3}$/,
    );
  });

  it("expire ten minutes after issue", () => {
    expect(newEnrolmentCode(NOW).expiresAtMs - NOW).toBe(ENROLMENT_CODE_TTL_MS);
  });

  it("normalise case and separators, so a typed code matches", () => {
    expect(normalizeCode("abcd-efgh 2345")).toBe("ABCDEFGH2345");
  });

  it("are never stored in clear: only a hash is kept", async () => {
    const store = new InMemoryDeviceStore();
    const code = await issueEnrolmentCode(store, NOW);
    expect(
      JSON.stringify([...(store as unknown as { codes: Map<string, unknown> }).codes.keys()]),
    ).not.toContain(code.replace(/-/g, ""));
  });
});

describe("enrolment", () => {
  it("registers a device once for a valid code, and refuses the same code again", async () => {
    const store = new InMemoryDeviceStore();
    const code = await issueEnrolmentCode(store, NOW);
    const first = await redeemEnrolment(store, code, "phone", NOW + 1000);
    expect(first).not.toBeNull();
    expect(await redeemEnrolment(store, code, "phone", NOW + 2000)).toBeNull();
  });

  it("refuses an expired code", async () => {
    const store = new InMemoryDeviceStore();
    const code = await issueEnrolmentCode(store, NOW);
    expect(await redeemEnrolment(store, code, "phone", NOW + ENROLMENT_CODE_TTL_MS)).toBeNull();
  });

  it("refuses a wrong code and registers nothing", async () => {
    const store = new InMemoryDeviceStore();
    await issueEnrolmentCode(store, NOW);
    expect(await redeemEnrolment(store, "AAAA-AAAA-AAAA-AAAA", "phone", NOW)).toBeNull();
    expect(await store.listDevices()).toEqual([]);
  });

  it("gives each device a distinct id and secret, and stores only the secret's hash", async () => {
    const store = new InMemoryDeviceStore();
    const first = await redeemEnrolment(store, await issueEnrolmentCode(store, NOW), "a", NOW);
    const second = await redeemEnrolment(store, await issueEnrolmentCode(store, NOW), "b", NOW);
    expect(first?.deviceId).not.toBe(second?.deviceId);
    expect(first?.deviceSecret).not.toBe(second?.deviceSecret);
    const record = await store.findDevice(first?.deviceId ?? "");
    expect(record?.secretSha256).toBe(sha256Hex(first?.deviceSecret ?? ""));
    expect(record?.secretSha256).not.toBe(first?.deviceSecret);
  });
});

describe("device authentication", () => {
  function bearer(id: string, secret: string): string {
    return `Bearer ${id}.${secret}`;
  }

  it("accepts the device's own id and secret", async () => {
    const store = new InMemoryDeviceStore();
    store.seedDevice(DEVICE_ID, DEVICE_SECRET);
    expect(await authenticateDevice(bearer(DEVICE_ID, DEVICE_SECRET), store)).toBe(DEVICE_ID);
  });

  it("refuses a wrong secret, an unknown id, and a secret from another device", async () => {
    const store = new InMemoryDeviceStore();
    store.seedDevice(DEVICE_ID, DEVICE_SECRET);
    store.seedDevice(
      "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "other-secret-0123456789abcdefghijklmnop",
    );
    expect(
      await authenticateDevice(bearer(DEVICE_ID, "wrong-secret-0123456789abcdefghijklmnop"), store),
    ).toBeNull();
    expect(
      await authenticateDevice(
        bearer("cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee", DEVICE_SECRET),
        store,
      ),
    ).toBeNull();
    expect(
      await authenticateDevice(bearer(DEVICE_ID, "other-secret-0123456789abcdefghijklmnop"), store),
    ).toBeNull();
  });

  it("refuses a revoked device even with its correct secret", async () => {
    const store = new InMemoryDeviceStore();
    store.seedDevice(DEVICE_ID, DEVICE_SECRET);
    expect(await store.revokeDevice(DEVICE_ID)).toBe(true);
    expect(await authenticateDevice(bearer(DEVICE_ID, DEVICE_SECRET), store)).toBeNull();
  });

  it("refuses a missing, malformed or short credential", async () => {
    const store = new InMemoryDeviceStore();
    store.seedDevice(DEVICE_ID, DEVICE_SECRET);
    expect(await authenticateDevice(undefined, store)).toBeNull();
    expect(await authenticateDevice("", store)).toBeNull();
    expect(await authenticateDevice(`Basic ${DEVICE_ID}.${DEVICE_SECRET}`, store)).toBeNull();
    expect(await authenticateDevice(`Bearer ${DEVICE_ID}`, store)).toBeNull();
    expect(await authenticateDevice(bearer(DEVICE_ID, "short"), store)).toBeNull();
    expect(await authenticateDevice(bearer("not-a-uuid", DEVICE_SECRET), store)).toBeNull();
  });
});

describe("owner commands", () => {
  it("issues a code, lists devices without secrets, and revokes by id", async () => {
    const store = new InMemoryDeviceStore();
    const issued = await runAdmin(["enrol-code"], store, NOW);
    expect(issued).toMatch(/enrolment code .*: [A-Z2-9]{4}(-[A-Z2-9]{4}){3}/);

    const enrolled = await redeemEnrolment(
      store,
      await issueEnrolmentCode(store, NOW),
      "phone",
      NOW,
    );
    const list = await runAdmin(["list-devices"], store, NOW);
    expect(list).toContain("phone");
    expect(list).not.toContain(enrolled?.deviceSecret ?? "");

    expect(
      await runAdmin(["revoke", enrolled?.deviceId ?? ""], store, NOW, () => Promise.resolve()),
    ).toMatch(/^revoked /);
    expect(await runAdmin(["revoke", "missing-device"], store, NOW, () => Promise.resolve())).toBe(
      "no device missing-device\n",
    );
  });

  it("prints usage for an unknown command", async () => {
    expect(await runAdmin([], new InMemoryDeviceStore(), NOW)).toMatch(/^usage:/);
  });
});
