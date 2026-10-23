import { BrokerError, enrolDevice } from "@lensmate/core";
import * as SecureStore from "expo-secure-store";

/**
 * The phone's own broker credential (BLOCKER-006). It is issued once, when the owner's single-use enrolment code is
 * exchanged, and it is kept only in device secure storage. No broker secret is shared across devices or built into
 * the app. The secret is never logged, shown, or returned to the UI.
 *
 * Nothing here clears or regenerates a credential on its own. Removal happens only through `clearDeviceCredential`,
 * which the UI calls after an explicit user action.
 */
export const DEVICE_CREDENTIAL_KEY = "lensmate.broker.device-credential";

// Same shapes the broker accepts (services/broker/src/devices.ts): a lower-case UUID and a URL-safe secret.
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEVICE_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export interface StoredDeviceCredential {
  readonly deviceId: string;
  readonly deviceSecret: string;
}

export type CredentialState =
  | { readonly status: "enrolled"; readonly credential: StoredDeviceCredential }
  | { readonly status: "missing" }
  | { readonly status: "invalid" };

/** The subset of expo-secure-store this module uses. Injected in tests. */
export interface CredentialStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options: { keychainAccessible: SecureStore.KeychainAccessibilityConstant },
  ): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export type CredentialStorageFailure = "READ_FAILED" | "WRITE_FAILED" | "DELETE_FAILED";

/** A storage failure. The message is a fixed code, never the stored value or the platform error text. */
export class CredentialStorageError extends Error {
  constructor(readonly failure: CredentialStorageFailure) {
    super(failure);
    this.name = "CredentialStorageError";
  }
}

export type EnrolmentFailure =
  | "ALREADY_ENROLLED"
  | "STORED_CREDENTIAL_INVALID"
  | "BUSY"
  | "REFUSED"
  | "RATE_LIMITED"
  | "NETWORK"
  | "MALFORMED"
  | "FAILED"
  | "REGISTERED_BUT_NOT_STORED";

/**
 * An enrolment failure with a fixed code. `deviceId` is set only for REGISTERED_BUT_NOT_STORED, so the owner can
 * revoke that device. The device secret is never part of the error.
 */
export class EnrolmentError extends Error {
  constructor(
    readonly failure: EnrolmentFailure,
    readonly deviceId?: string,
  ) {
    super(failure);
    this.name = "EnrolmentError";
  }
}

const secureStorage: CredentialStorage = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value, options) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

// Readable only while the device is unlocked, and never restored to another device from a backup.
const ACCESSIBILITY = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function isValidCredential(value: unknown): value is StoredDeviceCredential {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof StoredDeviceCredential, unknown>>;
  return (
    typeof candidate.deviceId === "string" &&
    DEVICE_ID_PATTERN.test(candidate.deviceId) &&
    typeof candidate.deviceSecret === "string" &&
    DEVICE_SECRET_PATTERN.test(candidate.deviceSecret)
  );
}

function serialise(credential: StoredDeviceCredential): string {
  return JSON.stringify({ deviceId: credential.deviceId, deviceSecret: credential.deviceSecret });
}

/**
 * Reads the stored credential. A missing or malformed value is reported as a state, not deleted: removing a
 * credential is a user decision. A failed read throws CredentialStorageError("READ_FAILED").
 */
export async function loadDeviceCredential(
  storage: CredentialStorage = secureStorage,
): Promise<CredentialState> {
  let raw: string | null;
  try {
    raw = await storage.getItemAsync(DEVICE_CREDENTIAL_KEY);
  } catch {
    throw new CredentialStorageError("READ_FAILED");
  }
  if (raw === null) {
    return { status: "missing" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValidCredential(parsed)) {
      return {
        status: "enrolled",
        credential: { deviceId: parsed.deviceId, deviceSecret: parsed.deviceSecret },
      };
    }
  } catch {
    // Not JSON: reported as invalid below.
  }
  return { status: "invalid" };
}

/**
 * Writes the credential, then reads it back and compares. A write that the platform reports as successful but does not
 * keep is caught here, not later on the first broker call.
 */
export async function saveDeviceCredential(
  credential: StoredDeviceCredential,
  storage: CredentialStorage = secureStorage,
): Promise<void> {
  if (!isValidCredential(credential)) {
    throw new CredentialStorageError("WRITE_FAILED");
  }
  const value = serialise(credential);
  try {
    await storage.setItemAsync(DEVICE_CREDENTIAL_KEY, value, ACCESSIBILITY);
  } catch {
    throw new CredentialStorageError("WRITE_FAILED");
  }
  let readBack: string | null;
  try {
    readBack = await storage.getItemAsync(DEVICE_CREDENTIAL_KEY);
  } catch {
    throw new CredentialStorageError("WRITE_FAILED");
  }
  if (readBack !== value) {
    throw new CredentialStorageError("WRITE_FAILED");
  }
}

/** Removes the credential. Call only after an explicit user action. */
export async function clearDeviceCredential(
  storage: CredentialStorage = secureStorage,
): Promise<void> {
  try {
    await storage.deleteItemAsync(DEVICE_CREDENTIAL_KEY);
  } catch {
    throw new CredentialStorageError("DELETE_FAILED");
  }
}

let enrolmentInFlight = false;

function mapBrokerFailure(error: unknown): EnrolmentFailure {
  if (!(error instanceof BrokerError)) {
    return "FAILED";
  }
  switch (error.code) {
    case "ENROLMENT_REFUSED":
      return "REFUSED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "NETWORK":
      return "NETWORK";
    case "MALFORMED_REPLY":
      return "MALFORMED";
    default:
      return "FAILED";
  }
}

/**
 * Exchanges the owner's enrolment code for this phone's credential and stores it.
 *
 * - Refuses while another enrolment is running (BUSY) and while a credential is already stored (ALREADY_ENROLLED), so
 *   a second registration cannot silently orphan a working device.
 * - If the broker registers the phone but the credential cannot be stored (after one retry), the function throws
 *   REGISTERED_BUT_NOT_STORED with the device id. The secret is then gone, so the owner must revoke that device.
 * - Returns only the device id.
 */
export async function enrolThisDevice(
  baseUrl: string,
  code: string,
  label: string,
  storage: CredentialStorage = secureStorage,
  doFetch?: typeof fetch,
): Promise<{ readonly deviceId: string }> {
  if (enrolmentInFlight) {
    throw new EnrolmentError("BUSY");
  }
  enrolmentInFlight = true;
  try {
    const existing = await loadDeviceCredential(storage);
    if (existing.status === "enrolled") {
      throw new EnrolmentError("ALREADY_ENROLLED", existing.credential.deviceId);
    }
    if (existing.status === "invalid") {
      // Removing a damaged credential is a user decision, never a side effect of enrolling.
      throw new EnrolmentError("STORED_CREDENTIAL_INVALID");
    }

    let enrolled: { readonly deviceId: string; readonly deviceSecret: string };
    try {
      enrolled = await enrolDevice(baseUrl, code, label, doFetch);
    } catch (error) {
      throw new EnrolmentError(mapBrokerFailure(error));
    }

    try {
      await saveDeviceCredential(enrolled, storage);
    } catch {
      try {
        await saveDeviceCredential(enrolled, storage);
      } catch {
        throw new EnrolmentError("REGISTERED_BUT_NOT_STORED", enrolled.deviceId);
      }
    }
    return { deviceId: enrolled.deviceId };
  } finally {
    enrolmentInFlight = false;
  }
}
