import { BrokerError } from "@lensmate/core";
import * as SecureStore from "expo-secure-store";
import type { BrokerConfig } from "./broker-config";
import type { CredentialState, CredentialStorage } from "./device-credential";

/**
 * Decides whether broker calls may be made at all. Broker usage stays unavailable until all of these
 * hold: the broker address is configured, this phone holds a well-formed device credential, and the owner-approved
 * cloud-processing disclosure has been accepted.
 */

export const CLOUD_DISCLOSURE_KEY = "lensmate.cloud-disclosure";

export type BrokerAccessBlock =
  | "NOT_CONFIGURED"
  | "CONFIG_INVALID"
  | "NOT_ENROLLED"
  | "CREDENTIAL_INVALID"
  | "DISCLOSURE_NOT_APPROVED"
  | "DISCLOSURE_REQUIRED"
  | "STORAGE_UNAVAILABLE";

export type BrokerAccess =
  | { readonly ok: true; readonly baseUrl: string; readonly token: string }
  | { readonly ok: false; readonly reason: BrokerAccessBlock };

export interface BrokerAccessInput {
  readonly config: BrokerConfig;
  readonly credential: CredentialState;
  /**
   * The approved disclosure version, or null while the owner has not approved the disclosure text (owner decision (e) in
   * provider-privacy-and-models.md). While it is null, no user can accept it, so broker usage stays unavailable.
   */
  readonly disclosureVersion: string | null;
  readonly disclosureAccepted: boolean;
}

/** Pure decision. The bearer token is built here and only here, from the device's own credential. */
export function resolveBrokerAccess(input: BrokerAccessInput): BrokerAccess {
  if (!input.config.ok) {
    return {
      ok: false,
      reason: input.config.reason === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "CONFIG_INVALID",
    };
  }
  if (input.credential.status === "missing") {
    return { ok: false, reason: "NOT_ENROLLED" };
  }
  if (input.credential.status === "invalid") {
    return { ok: false, reason: "CREDENTIAL_INVALID" };
  }
  if (input.disclosureVersion === null) {
    return { ok: false, reason: "DISCLOSURE_NOT_APPROVED" };
  }
  if (!input.disclosureAccepted) {
    return { ok: false, reason: "DISCLOSURE_REQUIRED" };
  }
  const { deviceId, deviceSecret } = input.credential.credential;
  return { ok: true, baseUrl: input.config.baseUrl, token: `${deviceId}.${deviceSecret}` };
}

/** Records acceptance of one approved disclosure version. */
export async function acceptCloudDisclosure(
  version: string,
  storage: CredentialStorage,
): Promise<void> {
  await storage.setItemAsync(CLOUD_DISCLOSURE_KEY, version, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** True only when the stored acceptance matches the currently approved version. Read errors count as not accepted. */
export async function isCloudDisclosureAccepted(
  approvedVersion: string | null,
  storage: CredentialStorage,
): Promise<boolean> {
  if (approvedVersion === null) {
    return false;
  }
  try {
    return (await storage.getItemAsync(CLOUD_DISCLOSURE_KEY)) === approvedVersion;
  } catch {
    return false;
  }
}

/**
 * The broker refused this device's credential. The app must not clear it on its own: the user is told to ask the
 * owner to enrol the phone again. Other refusals keep the credential.
 */
export function isCredentialRejected(error: unknown): boolean {
  return error instanceof BrokerError && error.code === "UNAUTHORIZED";
}
