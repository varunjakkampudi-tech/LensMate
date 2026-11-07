import * as SecureStore from "expo-secure-store";
import {
  type CredentialStorage,
  CredentialStorageError,
  DEVICE_CREDENTIAL_KEY,
  EnrolmentError,
  clearDeviceCredential,
  enrolThisDevice,
  isValidCredential,
  loadDeviceCredential,
  saveDeviceCredential,
} from "./device-credential";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const BASE_URL = "https://broker.example";
const DEVICE_ID = "11111111-2222-4333-8444-555555555555";
const SECRET = "not-a-real-device-secret-".repeat(3);
const CREDENTIAL = { deviceId: DEVICE_ID, deviceSecret: SECRET };

interface MemoryStorage extends CredentialStorage {
  readonly values: Map<string, string>;
  failReads: boolean;
  failWrites: number;
  failDeletes: boolean;
  /** When true, writes report success but store nothing. */
  dropWrites: boolean;
}

function memoryStorage(): MemoryStorage {
  const storage: MemoryStorage = {
    values: new Map<string, string>(),
    failReads: false,
    failWrites: 0,
    failDeletes: false,
    dropWrites: false,
    getItemAsync(key) {
      if (storage.failReads) {
        return Promise.reject(new Error("platform detail"));
      }
      return Promise.resolve(storage.values.get(key) ?? null);
    },
    setItemAsync(key, value) {
      if (storage.failWrites > 0) {
        storage.failWrites -= 1;
        return Promise.reject(new Error("platform detail"));
      }
      if (!storage.dropWrites) {
        storage.values.set(key, value);
      }
      return Promise.resolve();
    },
    deleteItemAsync(key) {
      if (storage.failDeletes) {
        return Promise.reject(new Error("platform detail"));
      }
      storage.values.delete(key);
      return Promise.resolve();
    },
  };
  return storage;
}

function replyWith(status: number, body: unknown): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
    )) as typeof fetch;
}

const ENROLLED_REPLY = { deviceId: DEVICE_ID, deviceSecret: SECRET };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("credential validation", () => {
  it("accepts the broker's shapes and rejects wrong lengths and characters", () => {
    expect(isValidCredential(CREDENTIAL)).toBe(true);
    expect(isValidCredential({ deviceId: DEVICE_ID, deviceSecret: "x".repeat(31) })).toBe(false);
    expect(isValidCredential({ deviceId: DEVICE_ID, deviceSecret: "x".repeat(257) })).toBe(false);
    expect(isValidCredential({ deviceId: "not-a-uuid", deviceSecret: SECRET })).toBe(false);
    expect(isValidCredential({ deviceId: DEVICE_ID, deviceSecret: `${SECRET} ` })).toBe(false);
    expect(isValidCredential(null)).toBe(false);
  });
});

describe("device credential storage", () => {
  it("round-trips the credential under one key and verifies the write", async () => {
    const storage = memoryStorage();
    await saveDeviceCredential(CREDENTIAL, storage);
    expect([...storage.values.keys()]).toEqual([DEVICE_CREDENTIAL_KEY]);
    expect(await loadDeviceCredential(storage)).toEqual({
      status: "enrolled",
      credential: CREDENTIAL,
    });
  });

  it("reports a missing credential as a state", async () => {
    expect(await loadDeviceCredential(memoryStorage())).toEqual({ status: "missing" });
  });

  it("reports a damaged value as invalid and does not delete it", async () => {
    const damaged = [
      '{"deviceId": 7}',
      "not json",
      JSON.stringify({ deviceId: DEVICE_ID, deviceSecret: "short" }),
    ];
    for (const value of damaged) {
      const storage = memoryStorage();
      storage.values.set(DEVICE_CREDENTIAL_KEY, value);
      expect(await loadDeviceCredential(storage)).toEqual({ status: "invalid" });
      expect(storage.values.get(DEVICE_CREDENTIAL_KEY)).toBe(value);
    }
  });

  it("refuses to save a credential of the wrong shape, without touching storage", async () => {
    const storage = memoryStorage();
    const bad = { deviceId: "x", deviceSecret: SECRET };
    await expect(saveDeviceCredential(bad, storage)).rejects.toMatchObject({
      failure: "WRITE_FAILED",
    });
    expect(storage.values.size).toBe(0);
  });

  it("fails safely when a write errors, and when a write is silently not kept", async () => {
    const failing = memoryStorage();
    failing.failWrites = 1;
    await expect(saveDeviceCredential(CREDENTIAL, failing)).rejects.toBeInstanceOf(
      CredentialStorageError,
    );

    const dropped = memoryStorage();
    dropped.dropWrites = true;
    await expect(saveDeviceCredential(CREDENTIAL, dropped)).rejects.toMatchObject({
      failure: "WRITE_FAILED",
    });
  });

  it("reports read and delete failures with fixed codes, not platform text", async () => {
    const storage = memoryStorage();
    storage.failReads = true;
    const readError = await loadDeviceCredential(storage).catch((error: unknown) => error);
    expect(readError).toMatchObject({ failure: "READ_FAILED" });
    expect((readError as Error).message).not.toContain("platform detail");

    storage.failDeletes = true;
    await expect(clearDeviceCredential(storage)).rejects.toMatchObject({
      failure: "DELETE_FAILED",
    });
  });

  it("clears the stored credential on explicit request", async () => {
    const storage = memoryStorage();
    await saveDeviceCredential(CREDENTIAL, storage);
    await clearDeviceCredential(storage);
    expect(await loadDeviceCredential(storage)).toEqual({ status: "missing" });
  });

  it("uses device-only, unlocked-only accessibility on the default secure store", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(CREDENTIAL));
    await saveDeviceCredential(CREDENTIAL);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      DEVICE_CREDENTIAL_KEY,
      JSON.stringify(CREDENTIAL),
      {
        keychainAccessible: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
      },
    );
  });
});

describe("enrolling this device", () => {
  it("stores the issued credential and returns only the device id", async () => {
    const storage = memoryStorage();
    const result = await enrolThisDevice(
      BASE_URL,
      "ABCD-EFGH-JKMN-PQRS",
      "phone",
      storage,
      replyWith(200, ENROLLED_REPLY),
    );
    expect(result).toEqual({ deviceId: DEVICE_ID });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(await loadDeviceCredential(storage)).toEqual({
      status: "enrolled",
      credential: CREDENTIAL,
    });
  });

  it("maps each refusal to a fixed code and stores nothing", async () => {
    const cases: [number, unknown, string][] = [
      [403, { code: "ENROLMENT_REFUSED" }, "REFUSED"],
      [429, { code: "RATE_LIMITED" }, "RATE_LIMITED"],
      [200, "not json", "MALFORMED"],
    ];
    for (const [status, body, failure] of cases) {
      const storage = memoryStorage();
      const error = await enrolThisDevice(
        BASE_URL,
        "AAAA-AAAA-AAAA-AAAA",
        "x",
        storage,
        replyWith(status, body),
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EnrolmentError);
      expect((error as EnrolmentError).failure).toBe(failure);
      expect(storage.values.size).toBe(0);
    }
  });

  it("maps a network failure to NETWORK", async () => {
    const storage = memoryStorage();
    const fetchImpl = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    await expect(
      enrolThisDevice(BASE_URL, "AAAA-AAAA-AAAA-AAAA", "x", storage, fetchImpl),
    ).rejects.toMatchObject({
      failure: "NETWORK",
    });
  });

  it("refuses to overwrite a damaged stored credential without the user removing it first", async () => {
    const storage = memoryStorage();
    storage.values.set(DEVICE_CREDENTIAL_KEY, "not json");
    const fetchImpl = jest.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(ENROLLED_REPLY), { status: 200 })),
    );
    await expect(
      enrolThisDevice(BASE_URL, "AAAA-AAAA-AAAA-AAAA", "x", storage, fetchImpl),
    ).rejects.toMatchObject({
      failure: "STORED_CREDENTIAL_INVALID",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storage.values.get(DEVICE_CREDENTIAL_KEY)).toBe("not json");
  });

  it("does not call the broker when a credential is already stored", async () => {
    const storage = memoryStorage();
    await saveDeviceCredential(CREDENTIAL, storage);
    const fetchImpl = jest.fn(
      replyWith(200, ENROLLED_REPLY) as (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>,
    );
    await expect(
      enrolThisDevice(BASE_URL, "AAAA-AAAA-AAAA-AAAA", "x", storage, fetchImpl),
    ).rejects.toMatchObject({
      failure: "ALREADY_ENROLLED",
      deviceId: DEVICE_ID,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a second enrolment while the first is still running", async () => {
    let release: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const storage = memoryStorage();
    const first = enrolThisDevice(BASE_URL, "AAAA-AAAA-AAAA-AAAA", "a", storage, () => pending);
    await expect(
      enrolThisDevice(
        BASE_URL,
        "BBBB-BBBB-BBBB-BBBB",
        "b",
        storage,
        replyWith(200, ENROLLED_REPLY),
      ),
    ).rejects.toMatchObject({
      failure: "BUSY",
    });
    release(new Response(JSON.stringify(ENROLLED_REPLY), { status: 200 }));
    await expect(first).resolves.toEqual({ deviceId: DEVICE_ID });
  });

  it("retries a failed local save once and recovers", async () => {
    const storage = memoryStorage();
    storage.failWrites = 1;
    await expect(
      enrolThisDevice(
        BASE_URL,
        "AAAA-AAAA-AAAA-AAAA",
        "x",
        storage,
        replyWith(200, ENROLLED_REPLY),
      ),
    ).resolves.toEqual({ deviceId: DEVICE_ID });
    expect(await loadDeviceCredential(storage)).toEqual({
      status: "enrolled",
      credential: CREDENTIAL,
    });
  });

  it("reports a registered-but-unstored device with its id and no secret, so the owner can revoke it", async () => {
    const storage = memoryStorage();
    storage.dropWrites = true;
    const error = await enrolThisDevice(
      BASE_URL,
      "AAAA-AAAA-AAAA-AAAA",
      "x",
      storage,
      replyWith(200, ENROLLED_REPLY),
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ failure: "REGISTERED_BUT_NOT_STORED", deviceId: DEVICE_ID });
    expect(JSON.stringify(error)).not.toContain(SECRET);
    expect((error as Error).message).not.toContain(SECRET);
  });

  it("uses a fresh enrolment after a refused code, so a replayed code is refused by the broker", async () => {
    const storage = memoryStorage();
    await enrolThisDevice(
      BASE_URL,
      "AAAA-AAAA-AAAA-AAAA",
      "first",
      storage,
      replyWith(200, ENROLLED_REPLY),
    );
    await clearDeviceCredential(storage);
    await expect(
      enrolThisDevice(
        BASE_URL,
        "AAAA-AAAA-AAAA-AAAA",
        "replay",
        storage,
        replyWith(403, { code: "ENROLMENT_REFUSED" }),
      ),
    ).rejects.toMatchObject({ failure: "REFUSED" });
  });
});
