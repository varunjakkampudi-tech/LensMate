import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { OfflineSyncQueue, QueueError } from "./offline-sync-queue.js";
import type {
  DeliveredEntry,
  PayloadCipher,
  QueueOptions,
  QueueStorage,
  SendResult,
  StoredRecord,
} from "./offline-sync-queue.js";

/** In-memory storage with failure injection. Saves are copies, like a real atomic write. */
class MemoryStorage implements QueueStorage {
  data: readonly StoredRecord[] | null = null;
  failSaves = 0;
  saves = 0;

  load(): Promise<readonly StoredRecord[] | null> {
    return Promise.resolve(this.data === null ? null : this.data.map((r) => ({ ...r })));
  }

  save(records: readonly StoredRecord[]): Promise<void> {
    if (this.failSaves > 0) {
      this.failSaves -= 1;
      return Promise.reject(new Error("disk full"));
    }
    this.saves += 1;
    this.data = records.map((r) => ({ ...r }));
    return Promise.resolve();
  }
}

/** Real AES-256-GCM, used in tests only. The AAD binds ciphertext to the entry. */
function aesCipher(): PayloadCipher {
  const key = randomBytes(32);
  return {
    seal(plaintext, aad) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(aad));
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Promise.resolve(
        [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join("."),
      );
    },
    open(ciphertext, aad) {
      const [ivB64, tagB64, bodyB64] = ciphertext.split(".");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64 ?? "", "base64"));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(tagB64 ?? "", "base64"));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(bodyB64 ?? "", "base64")),
        decipher.final(),
      ]);
      return Promise.resolve(plain.toString("utf8"));
    },
  };
}

function options(storage: QueueStorage, extra: Partial<QueueOptions> = {}): QueueOptions {
  return { ownerId: "owner-1", storage, ...extra };
}

const ok: SendResult = { ok: true };
const transient: SendResult = { ok: false, retryable: true };
const permanent: SendResult = { ok: false, retryable: false };

async function openQueue(storage: MemoryStorage, extra: Partial<QueueOptions> = {}) {
  return OfflineSyncQueue.open(options(storage, extra));
}

describe("OfflineSyncQueue", () => {
  it("restores pending entries after restart, in order", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "a", idempotencyKey: "k-a", kind: "note", payload: "first", sensitive: false },
      0,
    );
    await queue.enqueue(
      { id: "b", idempotencyKey: "k-b", kind: "note", payload: "second", sensitive: false },
      0,
    );

    const reopened = await openQueue(storage);
    expect(reopened.recovered).toBe(0);
    const delivered: string[] = [];
    await reopened.queue.drain(async (entry) => {
      await Promise.resolve();
      delivered.push(entry.payload);
      return ok;
    }, 0);
    expect(delivered).toEqual(["first", "second"]);
  });

  it("does not create a second entry for a repeated idempotency key", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    expect(
      await queue.enqueue(
        { id: "a", idempotencyKey: "same", kind: "task", payload: "x", sensitive: false },
        0,
      ),
    ).toEqual({ status: "ENQUEUED", id: "a" });
    expect(
      await queue.enqueue(
        { id: "b", idempotencyKey: "same", kind: "task", payload: "x", sensitive: false },
        0,
      ),
    ).toEqual({ status: "DUPLICATE", id: "a" });
    expect(queue.snapshot()).toHaveLength(1);
  });

  it("enforces entry-count, character-quota and payload-size limits", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage, {
      limits: { maxEntries: 2, maxChars: 10, maxPayloadChars: 6 },
    });
    expect(
      await queue.enqueue(
        { id: "big", idempotencyKey: "1", kind: "k", payload: "1234567", sensitive: false },
        0,
      ),
    ).toEqual({ status: "REJECTED", reason: "PAYLOAD_TOO_LARGE" });
    expect(
      await queue.enqueue(
        { id: "a", idempotencyKey: "2", kind: "k", payload: "123456", sensitive: false },
        0,
      ),
    ).toEqual({ status: "ENQUEUED", id: "a" });
    expect(
      await queue.enqueue(
        { id: "b", idempotencyKey: "3", kind: "k", payload: "123456", sensitive: false },
        0,
      ),
    ).toEqual({ status: "REJECTED", reason: "CHAR_QUOTA" });
    expect(
      await queue.enqueue(
        { id: "c", idempotencyKey: "4", kind: "k", payload: "1", sensitive: false },
        0,
      ),
    ).toEqual({ status: "ENQUEUED", id: "c" });
    expect(
      await queue.enqueue(
        { id: "d", idempotencyKey: "5", kind: "k", payload: "1", sensitive: false },
        0,
      ),
    ).toEqual({ status: "REJECTED", reason: "ENTRY_LIMIT" });
  });

  it("requires a cipher for sensitive entries, stores ciphertext only, and binds it to the entry", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await expect(
      queue.enqueue(
        { id: "s", idempotencyKey: "s1", kind: "memory", payload: "secret", sensitive: true },
        0,
      ),
    ).rejects.toMatchObject({ code: "CIPHER_REQUIRED" });

    const cipher = aesCipher();
    const secured = await openQueue(new MemoryStorage(), { cipher });
    await secured.queue.enqueue(
      { id: "s", idempotencyKey: "s1", kind: "memory", payload: "secret words", sensitive: true },
      0,
    );
    const stored = secured.queue.snapshot()[0];
    expect(stored?.payload).not.toContain("secret");

    // Ciphertext moved to another entry (different id) must not open.
    const moved: StoredRecord = { ...requireRecord(stored), id: "other" };
    const tampered = await OfflineSyncQueue.open(
      options({ load: () => Promise.resolve([moved]), save: () => Promise.resolve() }, { cipher }),
    );
    const deliveries: string[] = [];
    await tampered.queue.drain(async (entry) => {
      await Promise.resolve();
      deliveries.push(entry.payload);
      return ok;
    }, 0);
    expect(deliveries).toEqual([]);
    expect(tampered.queue.snapshot()[0]).toMatchObject({
      state: "DEAD",
      deadReason: "DECRYPT_FAILED",
      payload: "",
    });

    // The genuine entry decrypts for the sender.
    const delivered: DeliveredEntry[] = [];
    await secured.queue.drain(async (entry) => {
      await Promise.resolve();
      delivered.push(entry);
      return ok;
    }, 0);
    expect(delivered.map((d) => d.payload)).toEqual(["secret words"]);
  });

  it("delivers in sequence order and never delivers the same entry twice", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    for (const id of ["1", "2", "3"]) {
      await queue.enqueue(
        { id, idempotencyKey: `k${id}`, kind: "n", payload: id, sensitive: false },
        0,
      );
    }
    const seen: string[] = [];
    const sender = async (entry: DeliveredEntry): Promise<SendResult> => {
      await Promise.resolve();
      await Promise.resolve();
      seen.push(entry.id);
      return ok;
    };
    expect(await queue.drain(sender, 0)).toEqual({
      delivered: 3,
      retried: 0,
      dead: 0,
      stoppedByCancel: false,
    });
    expect(await queue.drain(sender, 0)).toEqual({
      delivered: 0,
      retried: 0,
      dead: 0,
      stoppedByCancel: false,
    });
    expect(seen).toEqual(["1", "2", "3"]);
    expect(queue.stats().DONE).toBe(3);
  });

  it("backs off exponentially with a cap and marks the entry DEAD after the attempt limit", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage, {
      retry: { baseDelayMs: 1000, factor: 2, maxDelayMs: 4000, maxAttempts: 4 },
    });
    await queue.enqueue(
      { id: "r", idempotencyKey: "r", kind: "n", payload: "x", sensitive: false },
      0,
    );
    const attemptsSeen: number[] = [];
    const failing = async (entry: DeliveredEntry): Promise<SendResult> => {
      await Promise.resolve();
      await Promise.resolve();
      attemptsSeen.push(entry.attempt);
      return transient;
    };

    expect(queue.backoffMs(1)).toBe(1000);
    expect(queue.backoffMs(2)).toBe(2000);
    expect(queue.backoffMs(3)).toBe(4000);
    expect(queue.backoffMs(9)).toBe(4000);

    expect((await queue.drain(failing, 0)).retried).toBe(1); // attempt 1 at t=0, next at t=1000
    expect((await queue.drain(failing, 999)).retried).toBe(0); // not due yet
    expect((await queue.drain(failing, 1000)).retried).toBe(1); // attempt 2, next at t=3000
    expect((await queue.drain(failing, 3000)).retried).toBe(1); // attempt 3, next at t=7000
    expect(await queue.drain(failing, 7000)).toEqual({
      delivered: 0,
      retried: 0,
      dead: 1,
      stoppedByCancel: false,
    });
    expect(attemptsSeen).toEqual([1, 2, 3, 4]);
    expect(queue.snapshot()[0]).toMatchObject({
      state: "DEAD",
      deadReason: "MAX_ATTEMPTS",
      payload: "",
    });
  });

  it("marks a permanent failure DEAD at once, and treats a thrown error as retryable", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "p", idempotencyKey: "p", kind: "n", payload: "x", sensitive: false },
      0,
    );
    await queue.enqueue(
      { id: "t", idempotencyKey: "t", kind: "n", payload: "y", sensitive: false },
      0,
    );

    const summary = await queue.drain(async (entry) => {
      await Promise.resolve();
      if (entry.id === "p") return permanent;
      throw new Error("socket reset");
    }, 0);
    expect(summary).toEqual({ delivered: 0, retried: 1, dead: 1, stoppedByCancel: false });
    expect(queue.snapshot().find((r) => r.id === "p")).toMatchObject({
      state: "DEAD",
      deadReason: "PERMANENT_FAILURE",
    });
    expect(queue.snapshot().find((r) => r.id === "t")).toMatchObject({
      state: "PENDING",
      attempts: 1,
    });
  });

  it("resends an interrupted in-flight entry after restart with the same idempotency key", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const first = await openQueue(storage);
    await first.queue.enqueue(
      { id: "i", idempotencyKey: "stable-key", kind: "n", payload: "once", sensitive: false },
      0,
    );

    // The process stops while the send is still unresolved; the IN_FLIGHT state is already saved.
    void first.queue.drain(() => new Promise<SendResult>(() => undefined), 0);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(storage.data?.[0]?.state).toBe("IN_FLIGHT");

    const restarted = await openQueue(storage);
    expect(restarted.recovered).toBe(1);
    const keys: string[] = [];
    await restarted.queue.drain(async (entry) => {
      await Promise.resolve();
      keys.push(entry.idempotencyKey);
      return ok;
    }, 0);
    expect(keys).toEqual(["stable-key"]);
  });

  it("cancelling during drain stops work, returns the entry to PENDING, and does not count an attempt", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "c1", idempotencyKey: "c1", kind: "n", payload: "1", sensitive: false },
      0,
    );
    await queue.enqueue(
      { id: "c2", idempotencyKey: "c2", kind: "n", payload: "2", sensitive: false },
      0,
    );
    const controller = new AbortController();
    const sentIds: string[] = [];
    const summary = await queue.drain(
      (entry, signal) =>
        new Promise<SendResult>((resolve) => {
          sentIds.push(entry.id);
          signal.addEventListener("abort", () => {
            resolve(transient);
          });
          controller.abort();
        }),
      0,
      controller.signal,
    );
    expect(summary.stoppedByCancel).toBe(true);
    expect(sentIds).toEqual(["c1"]);
    expect(queue.snapshot().map((r) => [r.id, r.state, r.attempts])).toEqual([
      ["c1", "PENDING", 0],
      ["c2", "PENDING", 0],
    ]);
  });

  it("CR-10: rejects a second record with an existing id and a different key, without mutating storage", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "note-1", idempotencyKey: "key-A", kind: "note", payload: "First", sensitive: false },
      0,
    );
    const before = storage.saves;
    expect(
      await queue.enqueue(
        {
          id: "note-1",
          idempotencyKey: "key-B",
          kind: "note",
          payload: "Second",
          sensitive: false,
        },
        0,
      ),
    ).toEqual({ status: "REJECTED", reason: "ID_CONFLICT" });
    expect(storage.saves).toBe(before);
    expect(queue.snapshot().map((r) => [r.id, r.payload])).toEqual([["note-1", "First"]]);
    const reopened = await openQueue(storage);
    expect(reopened.queue.snapshot()).toHaveLength(1);
  });

  it("CR-11: a canceled key is not reusable while its record is stored, and reopening still succeeds", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "r1", idempotencyKey: "same-key", kind: "n", payload: "a", sensitive: false },
      0,
    );
    expect(await queue.cancel("r1", 1)).toBe("CANCELLED");
    expect(
      await queue.enqueue(
        { id: "r2", idempotencyKey: "same-key", kind: "n", payload: "b", sensitive: false },
        2,
      ),
    ).toEqual({ status: "DUPLICATE", id: "r1" });
    expect(queue.snapshot().map((r) => r.id)).toEqual(["r1"]);

    const reopened = await openQueue(storage);
    expect(reopened.queue.snapshot().map((r) => [r.id, r.state])).toEqual([["r1", "CANCELLED"]]);
  });

  it("CR-11: after a canceled record is removed, its id and key can be reused and the snapshot reopens", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "r1", idempotencyKey: "k", kind: "n", payload: "a", sensitive: false },
      0,
    );
    await queue.cancel("r1", 1);
    expect(await queue.deletePermanently("r1")).toBe("DELETED");
    expect(
      await queue.enqueue(
        { id: "r1", idempotencyKey: "k", kind: "n", payload: "b", sensitive: false },
        2,
      ),
    ).toEqual({ status: "ENQUEUED", id: "r1" });
    const reopened = await openQueue(storage);
    expect(reopened.queue.snapshot()).toHaveLength(1);
  });

  it("CR-12: cancellation during a delayed decrypt means the sender is never called", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const real = aesCipher();
    const waiting: (() => void)[] = [];
    const delayed: PayloadCipher = {
      seal: (plaintext, aad) => real.seal(plaintext, aad),
      async open(ciphertext, aad) {
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
        });
        return real.open(ciphertext, aad);
      },
    };
    const { queue } = await openQueue(storage, { cipher: delayed });
    await queue.enqueue(
      { id: "s1", idempotencyKey: "s1", kind: "n", payload: "secret", sensitive: true },
      0,
    );
    const controller = new AbortController();
    let sent = 0;
    const drained = queue.drain(
      () => {
        sent += 1;
        return Promise.resolve(ok);
      },
      0,
      controller.signal,
    );
    // Wait until the drain is inside the delayed decrypt, then cancel, then let decrypt finish.
    while (waiting.length === 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    controller.abort();
    waiting.shift()?.();
    const summary = await drained;
    expect(sent).toBe(0);
    expect(summary.stoppedByCancel).toBe(true);
    expect(queue.snapshot()[0]).toMatchObject({ id: "s1", state: "PENDING", attempts: 0 });
  });

  it("cancelling a pending entry erases its payload; cancelling an in-flight entry is refused", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage, { cipher: aesCipher() });
    await queue.enqueue(
      { id: "x", idempotencyKey: "x", kind: "n", payload: "private", sensitive: true },
      0,
    );
    expect(await queue.cancel("x", 5)).toBe("CANCELLED");
    expect(queue.snapshot()[0]).toMatchObject({ state: "CANCELLED", payload: "", finishedAtMs: 5 });
    expect(await queue.cancel("x", 6)).toBe("ALREADY_FINISHED");
    expect(await queue.cancel("missing", 6)).toBe("NOT_FOUND");

    await queue.enqueue(
      { id: "y", idempotencyKey: "y", kind: "n", payload: "z", sensitive: false },
      0,
    );
    void queue.drain(() => new Promise<SendResult>(() => undefined), 0);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(await queue.cancel("y", 7)).toBe("IN_FLIGHT");
  });

  it("permanent deletion removes the record from storage", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    await queue.enqueue(
      { id: "d", idempotencyKey: "d", kind: "n", payload: "x", sensitive: false },
      0,
    );
    expect(await queue.deletePermanently("d")).toBe("DELETED");
    expect(storage.data).toEqual([]);
    expect(await queue.deletePermanently("d")).toBe("NOT_FOUND");
  });

  it("sweep removes expired pending entries and delivered entries past the dedupe window", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage, { dedupeWindowMs: 100, defaultTtlMs: 50 });
    await queue.enqueue(
      { id: "old", idempotencyKey: "old", kind: "n", payload: "x", sensitive: false },
      0,
    );
    await queue.enqueue(
      { id: "kept", idempotencyKey: "kept", kind: "n", payload: "y", sensitive: false },
      0,
    );
    await queue.drain(async (entry) => {
      await Promise.resolve();
      return entry.id === "kept" ? ok : transient;
    }, 0);
    expect(await queue.sweep(60)).toEqual({ removed: 1 }); // "old" expired pending; "kept" done, window open
    expect(queue.snapshot().map((r) => r.id)).toEqual(["kept"]);
    expect(await queue.sweep(200)).toEqual({ removed: 1 }); // dedupe window over
    expect(queue.snapshot()).toEqual([]);
  });

  it("fails closed on a corrupt snapshot or another owner's record, and does not overwrite storage", async () => {
    await Promise.resolve();
    const corrupt = new MemoryStorage();
    corrupt.data = [{ id: "bad" } as unknown as StoredRecord];
    await expect(openQueue(corrupt)).rejects.toMatchObject({ code: "QUEUE_CORRUPT" });
    expect(corrupt.saves).toBe(0);

    const foreign = new MemoryStorage();
    const { queue } = await openQueue(new MemoryStorage(), { ownerId: "owner-2" });
    await queue.enqueue(
      { id: "f", idempotencyKey: "f", kind: "n", payload: "x", sensitive: false },
      0,
    );
    foreign.data = queue.snapshot();
    const err = await openQueue(foreign).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QueueError);
    expect(err).toMatchObject({ code: "FOREIGN_RECORD" });
    expect(foreign.saves).toBe(0);
  });

  it("a failed save leaves the in-memory queue unchanged (no phantom entry)", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    storage.failSaves = 1;
    await expect(
      queue.enqueue({ id: "n", idempotencyKey: "n", kind: "n", payload: "x", sensitive: false }, 0),
    ).rejects.toThrow("disk full");
    expect(queue.snapshot()).toEqual([]);
    expect(storage.data).toBeNull();
    expect(
      await queue.enqueue(
        { id: "n", idempotencyKey: "n", kind: "n", payload: "x", sensitive: false },
        0,
      ),
    ).toEqual({ status: "ENQUEUED", id: "n" });
  });

  it("serializes concurrent enqueues: unique ordered sequence numbers and no lost entries", async () => {
    await Promise.resolve();
    const storage = new MemoryStorage();
    const { queue } = await openQueue(storage);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        queue.enqueue(
          {
            id: `e${String(i)}`,
            idempotencyKey: `k${String(i)}`,
            kind: "n",
            payload: String(i),
            sensitive: false,
          },
          0,
        ),
      ),
    );
    expect(results.every((r) => r.status === "ENQUEUED")).toBe(true);
    const seqs = queue.snapshot().map((r) => r.seq);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(storage.data).toHaveLength(20);
  });
});

function requireRecord(record: StoredRecord | undefined): StoredRecord {
  if (record === undefined) throw new Error("missing stored record");
  return record;
}
