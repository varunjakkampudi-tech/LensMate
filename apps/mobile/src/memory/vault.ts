import { Platform, Share } from "react-native";
import { MemoryStoreError } from "./memory-error";
import { nativeMemory } from "./native-store";

/**
 * On-phone memory (F4 to F6): notes, saved captures, answers and reminders. Only items the user chooses to save are
 * kept. On web each item is encrypted with AES-GCM under a non-extractable key that never leaves this browser.
 * On a phone items are stored in an SQLCipher database whose key sits in device secure storage (native-store.ts).
 */
/** "state" rows hold app settings such as automations. They are never listed as memory items. */
export type MemoryKind = "note" | "capture" | "answer" | "reminder" | "debrief" | "state";

export interface MemoryItem {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly title: string;
  readonly text: string;
  readonly imageDataUrl?: string;
  readonly createdAt: number;
  readonly dueAt?: number;
  readonly done?: boolean;
}

const DB = "lensmate-vault";
const STORE = "items";
const KEYS = "keys";

/** Why memory could not be read or saved, as a short code the screen can show. */
export function memoryErrorText(error: unknown): string {
  if (error instanceof MemoryStoreError) {
    switch (error.failure) {
      case "KEY_LOST":
        return "Saved memory cannot be opened: its key is missing. Delete everything to start again.";
      case "NOT_ENCRYPTED":
        return "Notes need the LensMate development build: Expo Go cannot open the encrypted database, so nothing was saved here.";
      case "UNAVAILABLE":
        return "Memory is unavailable on this device right now.";
      case "FAILED":
        return "Memory could not complete that. Try again.";
    }
  }
  return "Memory is unavailable in this browser.";
}

function isWeb(): boolean {
  return (
    Platform.OS === "web" &&
    typeof indexedDB !== "undefined" &&
    globalThis.crypto?.subtle !== undefined
  );
}

// One shared connection for the page. A failed open is retried on the next call.
let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
      request.result.createObjectStore(KEYS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("VAULT_UNAVAILABLE"));
  }).catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

function run<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = op(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(new Error("VAULT_FAILED"));
  });
}

// One key per browser profile. The promise is shared so two calls at once cannot each create a key and overwrite the
// other's, which would leave the first call's items unreadable.
let keyPromise: Promise<CryptoKey> | undefined;

function key(db: IDBDatabase): Promise<CryptoKey> {
  keyPromise ??= loadOrCreateKey(db).catch((error: unknown) => {
    keyPromise = undefined;
    throw error;
  });
  return keyPromise;
}

async function loadOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await run<CryptoKey | undefined>(db, KEYS, "readonly", (s) => s.get("main"));
  if (existing !== undefined) {
    return existing;
  }
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await run(db, KEYS, "readwrite", (s) => s.put(created, "main"));
  return created;
}

export async function saveItem(
  item: Omit<MemoryItem, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<MemoryItem> {
  if (Platform.OS !== "web") {
    const store = nativeMemory();
    const full: MemoryItem = {
      ...item,
      id: item.id ?? (await store.newId()),
      createdAt: item.createdAt ?? Date.now(),
    };
    await store.save({ id: full.id, createdAt: full.createdAt, body: JSON.stringify(full) });
    return full;
  }
  if (!isWeb()) {
    throw new MemoryStoreError("UNAVAILABLE");
  }
  const full: MemoryItem = {
    ...item,
    id: item.id ?? crypto.randomUUID(),
    createdAt: item.createdAt ?? Date.now(),
  };
  const db = await open();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(db),
    new TextEncoder().encode(JSON.stringify(full)),
  );
  await run(db, STORE, "readwrite", (s) => s.put({ iv, data }, full.id));
  return full;
}

/** Saves an app setting on the phone, encrypted with the memory store. Browsers keep settings in their own storage. */
export async function saveState(key: string, value: unknown): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  await saveItem({
    id: stateId(key),
    kind: "state",
    title: key,
    text: JSON.stringify(value),
    createdAt: 0,
  });
}

/** Reads an app setting saved by saveState. Null when nothing is stored or the stored value cannot be read. */
export async function loadState<T>(key: string): Promise<T | null> {
  if (Platform.OS === "web") {
    return null;
  }
  for (const body of await nativeMemory().list()) {
    try {
      const item = JSON.parse(body) as MemoryItem;
      if (item.id === stateId(key) && item.kind === "state") {
        return JSON.parse(item.text) as T;
      }
    } catch {
      // An unreadable row is skipped, the same as a damaged memory item.
    }
  }
  return null;
}

function stateId(key: string): string {
  return `state:${key}`;
}

export async function listItems(): Promise<MemoryItem[]> {
  if (Platform.OS !== "web") {
    const items: MemoryItem[] = [];
    for (const body of await nativeMemory().list()) {
      try {
        const item = JSON.parse(body) as MemoryItem;
        if (item.kind !== "state") {
          items.push(item);
        }
      } catch {
        // A row that is not valid JSON is skipped, never shown.
      }
    }
    return items;
  }
  if (!isWeb()) {
    throw new MemoryStoreError("UNAVAILABLE");
  }
  const db = await open();
  const k = await key(db);
  const rows = await run<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }[]>(
    db,
    STORE,
    "readonly",
    (s) => s.getAll(),
  );
  const items: MemoryItem[] = [];
  for (const row of rows) {
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv }, k, row.data);
      items.push(JSON.parse(new TextDecoder().decode(plain)) as MemoryItem);
    } catch {
      // An item that fails authentication is skipped, never shown.
    }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteItem(id: string): Promise<void> {
  if (Platform.OS !== "web") {
    await nativeMemory().remove(id);
    return;
  }
  if (!isWeb()) {
    throw new MemoryStoreError("UNAVAILABLE");
  }
  await run(await open(), STORE, "readwrite", (s) => s.delete(id));
}

/** Deletes every item and the key itself (data rights: delete all). */
export async function deleteAll(): Promise<void> {
  if (Platform.OS !== "web") {
    await nativeMemory().removeAll();
    return;
  }
  if (!isWeb()) {
    return;
  }
  const db = await open();
  await run(db, STORE, "readwrite", (s) => s.clear());
  await run(db, KEYS, "readwrite", (s) => s.clear());
  keyPromise = undefined;
}

/**
 * Export of everything the user saved, as JSON. On the web it downloads a file. On a phone it opens the system share
 * sheet with the JSON, so the user can save it to Files or send it elsewhere. Returns how many items were delivered:
 * 0 when the user cancels the share sheet, so no caller can report an export that did not happen.
 */
export async function exportAll(): Promise<number> {
  const items = await listItems();
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2);
  if (Platform.OS === "web") {
    const blob = new Blob([body], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lensmate-memory.json";
    a.click();
    URL.revokeObjectURL(a.href);
    return items.length;
  }
  const result = await Share.share({ title: "LensMate memory export", message: body });
  return result.action === Share.sharedAction ? items.length : 0;
}
