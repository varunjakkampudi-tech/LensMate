import { Platform } from "react-native";

/**
 * On-phone memory (F4 to F6): notes, saved captures, answers and reminders. Only items the user chooses to save are
 * kept. On web each item is encrypted with AES-GCM under a non-extractable key that never leaves this browser.
 * Native builds keep items in memory until the encrypted native store is added with the development build.
 */
export type MemoryKind = "note" | "capture" | "answer" | "reminder" | "debrief";

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
const memoryOnly = new Map<string, MemoryItem>();

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
  const full: MemoryItem = {
    ...item,
    id: item.id ?? crypto.randomUUID(),
    createdAt: item.createdAt ?? Date.now(),
  };
  if (!isWeb()) {
    memoryOnly.set(full.id, full);
    return full;
  }
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

export async function listItems(): Promise<MemoryItem[]> {
  if (!isWeb()) {
    return [...memoryOnly.values()].sort((a, b) => b.createdAt - a.createdAt);
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
  if (!isWeb()) {
    memoryOnly.delete(id);
    return;
  }
  await run(await open(), STORE, "readwrite", (s) => s.delete(id));
}

/** Deletes every item and the key itself (data rights: delete all). */
export async function deleteAll(): Promise<void> {
  memoryOnly.clear();
  if (!isWeb()) {
    return;
  }
  const db = await open();
  await run(db, STORE, "readwrite", (s) => s.clear());
  await run(db, KEYS, "readwrite", (s) => s.clear());
  keyPromise = undefined;
}

/** Export of everything the user saved, as a JSON download (web). */
export async function exportAll(): Promise<number> {
  const items = await listItems();
  if (Platform.OS === "web") {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lensmate-memory.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return items.length;
}
