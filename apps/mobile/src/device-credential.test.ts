import * as SecureStore from "expo-secure-store";
import {
  type CredentialStorage,
  DEVICE_CREDENTIAL_KEY,
  clearDeviceCredential,
  enrolThisDevice,
  loadDeviceCredential,
  saveDeviceCredential,
} from "./device-credential";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

function memoryStorage(): CredentialStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: (key) => Promise.resolve(values.get(key) ?? null),
    setItemAsync: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
}

const SECRET = "not-a-real-device-secret-".repeat(3);
const CREDENTIAL = { deviceId: "dev-1", deviceSecret: SECRET };

describe("device credential storage", () => {
  it("round-trips the credential through the store under one key", async () => {
    const storage = memoryStorage();
    await saveDeviceCredential(CREDENTIAL, storage);
    expect([...storage.values.keys()]).toEqual([DEVICE_CREDENTIAL_KEY]);
    expect(await loadDeviceCredential(storage)).toEqual(CREDENTIAL);
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadDeviceCredential(memoryStorage())).toBeNull();
  });

  it("treats a malformed stored value as absent and removes it", async () => {
    const storage = memoryStorage();
    storage.values.set(DEVICE_CREDENTIAL_KEY, '{"deviceId": 7}');
    expect(await loadDeviceCredential(storage)).toBeNull();
    expect(storage.values.has(DEVICE_CREDENTIAL_KEY)).toBe(false);
  });

  it("clears the stored credential", async () => {
    const storage = memoryStorage();
    await saveDeviceCredential(CREDENTIAL, storage);
    await clearDeviceCredential(storage);
    expect(await loadDeviceCredential(storage)).toBeNull();
  });

  it("uses device-only, unlocked-only accessibility on the default secure store", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    await saveDeviceCredential(CREDENTIAL);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      DEVICE_CREDENTIAL_KEY,
      JSON.stringify(CREDENTIAL),
      { keychainAccessible: "WHEN_UNLOCKED_THIS_DEVICE_ONLY" },
    );
  });
});

describe("enrolling this device", () => {
  it("stores the issued credential and returns only the device id", async () => {
    const storage = memoryStorage();
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ deviceId: "dev-9", deviceSecret: SECRET }), { status: 200 }),
      )) as typeof fetch;
    const result = await enrolThisDevice(
      "https://broker.example",
      "ABCD-EFGH-JKMN-PQRS",
      "phone",
      storage,
      fetchImpl,
    );
    expect(result).toEqual({ deviceId: "dev-9" });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(await loadDeviceCredential(storage)).toEqual({
      deviceId: "dev-9",
      deviceSecret: SECRET,
    });
  });

  it("stores nothing when the broker refuses the code", async () => {
    const storage = memoryStorage();
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: "ENROLMENT_REFUSED" }), { status: 403 }),
      )) as typeof fetch;
    await expect(
      enrolThisDevice("https://broker.example", "AAAA-AAAA-AAAA-AAAA", "phone", storage, fetchImpl),
    ).rejects.toThrow();
    expect(storage.values.size).toBe(0);
  });
});
