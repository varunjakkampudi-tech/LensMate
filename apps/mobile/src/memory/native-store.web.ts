import { MemoryStoreError } from "./memory-error";

/**
 * Web build stub. The phone's encrypted store (native-store.ts) uses expo-sqlite, whose web build needs a WebAssembly
 * worker that the web bundle does not include. Browser memory uses the encrypted IndexedDB vault in vault.ts instead,
 * so this stub is never called on web. If it ever is, it refuses rather than writing anywhere.
 */
export function nativeMemory(): never {
  throw new MemoryStoreError("UNAVAILABLE");
}
