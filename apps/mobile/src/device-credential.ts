import { enrolDevice } from "@lensmate/core";
import * as SecureStore from "expo-secure-store";

/**
 * The phone's own broker credential (BLOCKER-006). It is issued once, when the owner's single-use enrolment code is
 * exchanged, and it is stored only in device secure storage. No broker secret is shared across devices or built into
 * the app. The secret is never logged, shown, or returned to the UI.
 */
export const DEVICE_CREDENTIAL_KEY = "lensmate.broker.device-credential";

export interface StoredDeviceCredential {
  readonly deviceId: string;
  readonly deviceSecret: string;
}

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

const secureStorage: CredentialStorage = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value, options) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

// Readable only while the device is unlocked, never restored to another device from a backup.
const ACCESSIBILITY = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function saveDeviceCredential(
  credential: StoredDeviceCredential,
  storage: CredentialStorage = secureStorage,
): Promise<void> {
  await storage.setItemAsync(
    DEVICE_CREDENTIAL_KEY,
    JSON.stringify({ deviceId: credential.deviceId, deviceSecret: credential.deviceSecret }),
    ACCESSIBILITY,
  );
}

/** Returns the stored credential, or null when none exists or the stored value is malformed. */
export async function loadDeviceCredential(
  storage: CredentialStorage = secureStorage,
): Promise<StoredDeviceCredential | null> {
  const raw = await storage.getItemAsync(DEVICE_CREDENTIAL_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDeviceCredential>;
    if (typeof parsed.deviceId === "string" && typeof parsed.deviceSecret === "string") {
      return { deviceId: parsed.deviceId, deviceSecret: parsed.deviceSecret };
    }
  } catch {
    // Fall through: a malformed value is treated as absent and removed below.
  }
  await storage.deleteItemAsync(DEVICE_CREDENTIAL_KEY);
  return null;
}

export async function clearDeviceCredential(
  storage: CredentialStorage = secureStorage,
): Promise<void> {
  await storage.deleteItemAsync(DEVICE_CREDENTIAL_KEY);
}

/**
 * Exchanges the owner's enrolment code for this phone's credential and stores it. Returns only the device id, so the
 * secret never reaches the UI or a log. A refused code throws the core client's BrokerError.
 */
export async function enrolThisDevice(
  baseUrl: string,
  code: string,
  label: string,
  storage: CredentialStorage = secureStorage,
  doFetch?: typeof fetch,
): Promise<{ readonly deviceId: string }> {
  const enrolled = await enrolDevice(baseUrl, code, label, doFetch);
  await saveDeviceCredential(enrolled, storage);
  return { deviceId: enrolled.deviceId };
}
