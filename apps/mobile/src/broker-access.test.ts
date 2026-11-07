import { BrokerError } from "@lensmate/core";
import {
  resolveBrokerAccess,
  isCredentialRejected,
  acceptCloudDisclosure,
  isCloudDisclosureAccepted,
  CLOUD_DISCLOSURE_KEY,
} from "./broker-access";
import type { BrokerConfig } from "./broker-config";
import type { CredentialState, CredentialStorage } from "./device-credential";

const CONFIG: BrokerConfig = { ok: true, baseUrl: "https://broker.example" };
const CREDENTIAL: CredentialState = {
  status: "enrolled",
  credential: {
    deviceId: "11111111-2222-4333-8444-555555555555",
    deviceSecret: "not-a-real-device-secret-".repeat(3),
  },
};
const APPROVED = { disclosureVersion: "2026-11-01", disclosureAccepted: true };

describe("resolveBrokerAccess", () => {
  it("allows broker calls only with a configured address, an enrolled device and an accepted disclosure", () => {
    expect(resolveBrokerAccess({ config: CONFIG, credential: CREDENTIAL, ...APPROVED })).toEqual({
      ok: true,
      baseUrl: "https://broker.example",
      token: `11111111-2222-4333-8444-555555555555.${"not-a-real-device-secret-".repeat(3)}`,
    });
  });

  it("blocks each missing precondition with its own reason", () => {
    expect(
      resolveBrokerAccess({
        config: { ok: false, reason: "NOT_CONFIGURED" },
        credential: CREDENTIAL,
        ...APPROVED,
      }),
    ).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(
      resolveBrokerAccess({
        config: { ok: false, reason: "INSECURE" },
        credential: CREDENTIAL,
        ...APPROVED,
      }),
    ).toEqual({ ok: false, reason: "CONFIG_INVALID" });
    expect(
      resolveBrokerAccess({ config: CONFIG, credential: { status: "missing" }, ...APPROVED }),
    ).toEqual({ ok: false, reason: "NOT_ENROLLED" });
    expect(
      resolveBrokerAccess({ config: CONFIG, credential: { status: "invalid" }, ...APPROVED }),
    ).toEqual({ ok: false, reason: "CREDENTIAL_INVALID" });
    expect(
      resolveBrokerAccess({
        config: CONFIG,
        credential: CREDENTIAL,
        disclosureVersion: null,
        disclosureAccepted: false,
      }),
    ).toEqual({ ok: false, reason: "DISCLOSURE_NOT_APPROVED" });
    expect(
      resolveBrokerAccess({
        config: CONFIG,
        credential: CREDENTIAL,
        disclosureVersion: "2026-11-01",
        disclosureAccepted: false,
      }),
    ).toEqual({ ok: false, reason: "DISCLOSURE_REQUIRED" });
  });
});

describe("disclosure acceptance", () => {
  function store(): CredentialStorage & { values: Map<string, string> } {
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

  it("is accepted only for the currently approved version", async () => {
    const storage = store();
    await acceptCloudDisclosure("2026-11-01", storage);
    expect(storage.values.get(CLOUD_DISCLOSURE_KEY)).toBe("2026-11-01");
    expect(await isCloudDisclosureAccepted("2026-11-01", storage)).toBe(true);
    expect(await isCloudDisclosureAccepted("2026-12-01", storage)).toBe(false);
    expect(await isCloudDisclosureAccepted(null, storage)).toBe(false);
  });

  it("counts a failed read as not accepted", async () => {
    const failing = store();
    failing.getItemAsync = () => Promise.reject(new Error("platform"));
    expect(await isCloudDisclosureAccepted("2026-11-01", failing)).toBe(false);
  });
});

describe("revocation", () => {
  it("treats only a broker UNAUTHORIZED refusal as a rejected credential", () => {
    expect(isCredentialRejected(new BrokerError("UNAUTHORIZED", "UNAUTHORIZED", false))).toBe(true);
    expect(isCredentialRejected(new BrokerError("BUDGET_EXHAUSTED", "CAP_REACHED", false))).toBe(
      false,
    );
    expect(isCredentialRejected(new Error("UNAUTHORIZED"))).toBe(false);
  });
});
