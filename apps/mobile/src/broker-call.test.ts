import { BrokerError, type BrokerChatRequest } from "@lensmate/core";
import { isCredentialRejected } from "./broker-access";
import {
  APPROVED_CLOUD_DISCLOSURE_VERSION,
  BrokerCallBlocked,
  callBroker,
  callBrokerWithPolicy,
  type BrokerCallPolicy,
} from "./broker-call";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
import {
  DEVICE_CREDENTIAL_KEY,
  loadDeviceCredential,
  type CredentialStorage,
} from "./device-credential";

const DEVICE_ID = "11111111-2222-4333-8444-555555555555";
const SECRET = "not-a-real-device-secret-".repeat(3);
const APPROVED = "2026-11-01";
const DISCLOSURE_KEY = "lensmate.cloud-disclosure";
const REQUEST: BrokerChatRequest = {
  model: "google/gemini-3.1-flash-lite",
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 32,
};
const REPLY = { requestId: "r-1", text: "hi", costPaise: 3, source: "mock" };

function memory(
  initial: Record<string, string> = {},
): CredentialStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
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

const ENROLLED = {
  [DEVICE_CREDENTIAL_KEY]: JSON.stringify({ deviceId: DEVICE_ID, deviceSecret: SECRET }),
};
const READY = { ...ENROLLED, [DISCLOSURE_KEY]: APPROVED };

function spyFetch(status = 200, body: unknown = REPLY) {
  return jest.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function policyFor(
  storage: CredentialStorage,
  fetchImpl: ReturnType<typeof spyFetch>,
  overrides: Partial<BrokerCallPolicy> = {},
): BrokerCallPolicy {
  return {
    config: { ok: true, baseUrl: "https://broker.example" },
    storage,
    approvedDisclosureVersion: APPROVED,
    doFetch: fetchImpl as unknown as typeof fetch,
    ...overrides,
  };
}

const SIGNAL = new AbortController().signal;

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BrokerCallBlocked) {
      return error.reason;
    }
    throw error;
  }
  return "NOT_BLOCKED";
}

describe("callBrokerWithPolicy", () => {
  it("makes no request while the disclosure is not approved, even with everything else ready", async () => {
    const fetchImpl = spyFetch();
    const storage = memory(READY);
    expect(
      await reasonOf(
        callBrokerWithPolicy(
          policyFor(storage, fetchImpl, { approvedDisclosureVersion: null }),
          REQUEST,
          SIGNAL,
        ),
      ),
    ).toBe("DISCLOSURE_NOT_APPROVED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes no request until the approved disclosure is accepted", async () => {
    const fetchImpl = spyFetch();
    expect(
      await reasonOf(callBrokerWithPolicy(policyFor(memory(ENROLLED), fetchImpl), REQUEST, SIGNAL)),
    ).toBe("DISCLOSURE_REQUIRED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes no request without an address, an enrolled device, or a well-formed credential", async () => {
    const fetchImpl = spyFetch();
    expect(
      await reasonOf(
        callBrokerWithPolicy(
          policyFor(memory(READY), fetchImpl, { config: { ok: false, reason: "NOT_CONFIGURED" } }),
          REQUEST,
          SIGNAL,
        ),
      ),
    ).toBe("NOT_CONFIGURED");
    expect(
      await reasonOf(
        callBrokerWithPolicy(
          policyFor(memory({ [DISCLOSURE_KEY]: APPROVED }), fetchImpl),
          REQUEST,
          SIGNAL,
        ),
      ),
    ).toBe("NOT_ENROLLED");
    expect(
      await reasonOf(
        callBrokerWithPolicy(
          policyFor(memory({ ...READY, [DEVICE_CREDENTIAL_KEY]: "damaged" }), fetchImpl),
          REQUEST,
          SIGNAL,
        ),
      ),
    ).toBe("CREDENTIAL_INVALID");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes no request when secure storage cannot be read", async () => {
    const fetchImpl = spyFetch();
    const storage = memory(READY);
    storage.getItemAsync = () => Promise.reject(new Error("platform detail"));
    expect(
      await reasonOf(callBrokerWithPolicy(policyFor(storage, fetchImpl), REQUEST, SIGNAL)),
    ).toBe("STORAGE_UNAVAILABLE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the request with this device's own token only when every precondition holds", async () => {
    const fetchImpl = spyFetch();
    const reply = await callBrokerWithPolicy(policyFor(memory(READY), fetchImpl), REQUEST, SIGNAL);
    expect(reply).toEqual(REPLY);
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${DEVICE_ID}.${SECRET}`);
  });

  it("treats a broker refusal of the credential as revocation and never clears the stored credential", async () => {
    const storage = memory(READY);
    const error = await callBrokerWithPolicy(
      policyFor(storage, spyFetch(401, { code: "UNAUTHORIZED" })),
      REQUEST,
      SIGNAL,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrokerError);
    expect(isCredentialRejected(error)).toBe(true);
    expect((await loadDeviceCredential(storage)).status).toBe("enrolled");
  });
});

describe("the app entry point", () => {
  it("uses the owner-approved disclosure version and still refuses without a configured address", async () => {
    expect(APPROVED_CLOUD_DISCLOSURE_VERSION).toBe("2026-10-24.2");
    // No address is configured in this test run, so the entry point refuses before any request.
    await expect(callBroker(REQUEST, SIGNAL)).rejects.toBeInstanceOf(BrokerCallBlocked);
  });
});
