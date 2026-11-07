import { callBrokerBackup, type BackupInfo } from "../broker-call";
import { listItems, saveItem, type MemoryItem } from "./vault";

/**
 * Optional server backup of memory (owner request, 2026-10-24). Items are encrypted here with AES-GCM under a key
 * derived from the user's backup passphrase (PBKDF2-SHA-256, 310,000 rounds, random salt); the broker stores only the
 * ciphertext and deletes it when the chosen retention ends. Photos are left out unless the user includes them.
 */
const ROUNDS = 310_000;
export const RETENTION_CHOICES = [7, 30, 90, 365] as const;

// Chunked so large payloads do not exceed the call-stack limit of String.fromCharCode(...bytes).
const b64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};
const unb64 = (text: string) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

async function keyFrom(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ROUNDS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealItems(items: readonly MemoryItem[], passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(passphrase, salt);
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(items)),
    ),
  );
  return `v1.${b64(salt)}.${b64(iv)}.${b64(data)}`;
}

export async function openItems(sealed: string, passphrase: string): Promise<MemoryItem[]> {
  const [version, salt, iv, data] = sealed.split(".");
  if (version !== "v1" || salt === undefined || iv === undefined || data === undefined) {
    throw new Error("BACKUP_FORMAT");
  }
  const key = await keyFrom(passphrase, unb64(salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(data));
    return JSON.parse(new TextDecoder().decode(plain)) as MemoryItem[];
  } catch {
    throw new Error("BACKUP_PASSPHRASE");
  }
}

export async function backUp(
  passphrase: string,
  retentionDays: number,
  includePhotos: boolean,
): Promise<{ count: number; expiresAt: number }> {
  const items = (await listItems()).map((i) =>
    includePhotos ? i : { ...i, imageDataUrl: undefined },
  );
  const ciphertext = await sealItems(items, passphrase);
  const saved = await callBrokerBackup("PUT", { ciphertext, retentionDays });
  return { count: items.length, expiresAt: saved?.expiresAt ?? 0 };
}

/** Restores into this device, keeping local items; items with the same id are replaced by the backup copy. */
export async function restore(passphrase: string): Promise<number> {
  const stored = (await callBrokerBackup("GET")) as BackupInfo | null;
  if (stored === null) {
    throw new Error("BACKUP_NONE");
  }
  const items = await openItems(stored.ciphertext, passphrase);
  for (const item of items) {
    await saveItem(item);
  }
  return items.length;
}

export async function backupStatus(): Promise<BackupInfo | null> {
  return (await callBrokerBackup("GET")) as BackupInfo | null;
}

export async function deleteBackup(): Promise<void> {
  await callBrokerBackup("DELETE");
}

export function backupErrorText(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "BACKUP_PASSPHRASE") return "That backup passphrase does not open this backup.";
  if (code === "BACKUP_FORMAT") return "The backup on the server is damaged and cannot be opened.";
  if (code === "BACKUP_NONE") return "There is no backup on the server (or it has expired).";
  if (code === "BACKUP_400") return "The backup is too large. Leave photos out and try again.";
  if (code.startsWith("BACKUP_")) return "The server could not store the backup. Try again later.";
  return "Backup needs this phone enrolled and the cloud notice accepted.";
}
