export type MemoryStoreFailure = "UNAVAILABLE" | "NOT_ENCRYPTED" | "KEY_LOST" | "FAILED";

/** A storage failure. The message is a fixed code, never a row, a key or platform error text. */
export class MemoryStoreError extends Error {
  constructor(readonly failure: MemoryStoreFailure) {
    super(failure);
    this.name = "MemoryStoreError";
  }
}
