/**
 * Local queue and deferred synchronization (checklist B17).
 *
 * Authorized work is stored locally while offline and delivered later, in order, with bounded
 * retries. Delivery is at-least-once: each entry carries an idempotency key, which the receiving
 * side must use to ignore repeats. The queue itself never imports network, phone, or native code.
 *
 * Storage: the whole snapshot is saved through an injected `QueueStorage` with an atomic `save`.
 * Every operation is serialized, and in-memory state changes only after a save succeeds.
 */

export type EntryState = "PENDING" | "IN_FLIGHT" | "DONE" | "DEAD" | "CANCELLED";

/** One stored entry. `payload` is ciphertext when `sensitive` is true, and is erased once finished. */
export interface StoredRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly idempotencyKey: string;
  readonly seq: number;
  readonly kind: string;
  readonly sensitive: boolean;
  readonly payload: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly state: EntryState;
  readonly attempts: number;
  readonly nextAttemptAtMs: number;
  readonly finishedAtMs: number | null;
  readonly deadReason: string | null;
}

export interface QueueStorage {
  /** Returns the saved snapshot, or null when nothing was saved yet. */
  load(): Promise<readonly StoredRecord[] | null>;
  /** Atomically replaces the snapshot. On failure it must leave the stored data unchanged. */
  save(records: readonly StoredRecord[]): Promise<void>;
}

/** Authenticated encryption for sensitive payloads. `aad` binds ciphertext to its entry. */
export interface PayloadCipher {
  seal(plaintext: string, aad: string): Promise<string>;
  open(ciphertext: string, aad: string): Promise<string>;
}

export interface QueueLimits {
  /** Maximum number of stored records, including finished ones kept for the dedupe window. */
  readonly maxEntries: number;
  /** Maximum total stored payload characters. */
  readonly maxChars: number;
  /** Maximum plaintext payload characters for one entry. */
  readonly maxPayloadChars: number;
}

export interface RetryPolicy {
  readonly baseDelayMs: number;
  readonly factor: number;
  readonly maxDelayMs: number;
  /** Failed attempts before the entry is marked DEAD. */
  readonly maxAttempts: number;
}

export interface QueueOptions {
  readonly ownerId: string;
  readonly storage: QueueStorage;
  readonly cipher?: PayloadCipher;
  readonly limits?: Partial<QueueLimits>;
  readonly retry?: Partial<RetryPolicy>;
  /** How long DONE/DEAD/CANCELLED records keep their idempotency key. */
  readonly dedupeWindowMs?: number;
  /** Default lifetime of a pending entry when `ttlMs` is not given. */
  readonly defaultTtlMs?: number;
}

export interface EnqueueInput {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly kind: string;
  readonly payload: string;
  readonly sensitive: boolean;
  readonly ttlMs?: number;
}

export type EnqueueResult =
  | { readonly status: "ENQUEUED"; readonly id: string }
  | { readonly status: "DUPLICATE"; readonly id: string }
  | {
      readonly status: "REJECTED";
      readonly reason: "ENTRY_LIMIT" | "CHAR_QUOTA" | "PAYLOAD_TOO_LARGE";
    };

export interface DeliveredEntry {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly kind: string;
  /** Decrypted payload. Only handed to the sender, never stored in plaintext. */
  readonly payload: string;
  /** 1-based attempt number for this delivery. */
  readonly attempt: number;
}

export type SendResult =
  { readonly ok: true } | { readonly ok: false; readonly retryable: boolean };

export type Sender = (entry: DeliveredEntry, signal: AbortSignal) => Promise<SendResult>;

export interface DrainSummary {
  readonly delivered: number;
  readonly retried: number;
  readonly dead: number;
  readonly stoppedByCancel: boolean;
}

export type CancelResult = "CANCELLED" | "IN_FLIGHT" | "ALREADY_FINISHED" | "NOT_FOUND";
export type DeleteResult = "DELETED" | "IN_FLIGHT" | "NOT_FOUND";

export type QueueErrorCode = "CIPHER_REQUIRED" | "QUEUE_CORRUPT" | "FOREIGN_RECORD";

export class QueueError extends Error {
  constructor(
    readonly code: QueueErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QueueError";
  }
}

const DEFAULT_LIMITS: QueueLimits = {
  maxEntries: 1000,
  maxChars: 2_000_000,
  maxPayloadChars: 64_000,
};
const DEFAULT_RETRY: RetryPolicy = {
  baseDelayMs: 1_000,
  factor: 2,
  maxDelayMs: 60_000,
  maxAttempts: 6,
};
const DEFAULT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATES: readonly EntryState[] = ["PENDING", "IN_FLIGHT", "DONE", "DEAD", "CANCELLED"];

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function aadFor(record: { ownerId: string; id: string; idempotencyKey: string }): string {
  return JSON.stringify([record.ownerId, record.id, record.idempotencyKey]);
}

function isRecord(value: unknown): value is StoredRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["ownerId"] === "string" &&
    typeof r["idempotencyKey"] === "string" &&
    Number.isInteger(r["seq"]) &&
    typeof r["kind"] === "string" &&
    typeof r["sensitive"] === "boolean" &&
    typeof r["payload"] === "string" &&
    Number.isFinite(r["createdAtMs"]) &&
    Number.isFinite(r["expiresAtMs"]) &&
    typeof r["state"] === "string" &&
    (STATES as readonly string[]).includes(r["state"]) &&
    Number.isInteger(r["attempts"]) &&
    (r["attempts"] as number) >= 0 &&
    Number.isFinite(r["nextAttemptAtMs"]) &&
    (r["finishedAtMs"] === null || Number.isFinite(r["finishedAtMs"])) &&
    (r["deadReason"] === null || typeof r["deadReason"] === "string")
  );
}

export class OfflineSyncQueue {
  private records: readonly StoredRecord[];
  private chain: Promise<unknown> = Promise.resolve();
  private draining = false;
  private readonly limits: QueueLimits;
  private readonly retry: RetryPolicy;
  private readonly dedupeWindowMs: number;
  private readonly defaultTtlMs: number;

  private constructor(
    private readonly options: QueueOptions,
    records: readonly StoredRecord[],
  ) {
    this.records = records;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Loads the saved snapshot and validates it. Corrupt data or a record for another owner
   * fails closed and leaves storage untouched. Entries that were IN_FLIGHT when the previous
   * process stopped return to PENDING, so they are resent with the same idempotency key.
   */
  static async open(
    options: QueueOptions,
  ): Promise<{ queue: OfflineSyncQueue; recovered: number }> {
    const loaded = (await options.storage.load()) ?? [];
    const keys = new Set<string>();
    const ids = new Set<string>();
    for (const record of loaded) {
      if (!isRecord(record)) {
        throw new QueueError("QUEUE_CORRUPT", "stored record has an invalid shape");
      }
      if (record.ownerId !== options.ownerId) {
        throw new QueueError("FOREIGN_RECORD", "stored record belongs to another owner");
      }
      if (ids.has(record.id) || keys.has(record.idempotencyKey)) {
        throw new QueueError("QUEUE_CORRUPT", "duplicate id or idempotency key in snapshot");
      }
      ids.add(record.id);
      keys.add(record.idempotencyKey);
      if (record.sensitive && options.cipher === undefined && record.payload !== "") {
        throw new QueueError(
          "CIPHER_REQUIRED",
          "sensitive entries are stored but no cipher was given",
        );
      }
    }

    const recovered = loaded.filter((r) => r.state === "IN_FLIGHT").length;
    const restored = loaded.map((r) =>
      r.state === "IN_FLIGHT" ? { ...r, state: "PENDING" as const } : r,
    );
    const queue = new OfflineSyncQueue(options, restored);
    if (recovered > 0) {
      await options.storage.save(restored);
    }
    return { queue, recovered };
  }

  /** Serializes operations so that concurrent calls never interleave their saves. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Saves the candidate snapshot first; memory changes only when the save succeeds. */
  private async commit(next: readonly StoredRecord[]): Promise<void> {
    await this.options.storage.save(next);
    this.records = next;
  }

  async enqueue(input: EnqueueInput, nowMs: number): Promise<EnqueueResult> {
    return this.run(async () => {
      const cipher = this.options.cipher;
      const duplicate = this.records.find(
        (r) => r.idempotencyKey === input.idempotencyKey && r.state !== "CANCELLED",
      );
      if (duplicate) {
        return { status: "DUPLICATE", id: duplicate.id };
      }
      if (input.payload.length > this.limits.maxPayloadChars) {
        return { status: "REJECTED", reason: "PAYLOAD_TOO_LARGE" };
      }
      if (this.records.length >= this.limits.maxEntries) {
        return { status: "REJECTED", reason: "ENTRY_LIMIT" };
      }
      if (input.sensitive && this.options.cipher === undefined) {
        throw new QueueError("CIPHER_REQUIRED", "sensitive entries need a cipher");
      }

      const ownerId = this.options.ownerId;
      const stored =
        input.sensitive && cipher !== undefined
          ? await cipher.seal(
              input.payload,
              aadFor({ ownerId, id: input.id, idempotencyKey: input.idempotencyKey }),
            )
          : input.payload;
      const usedChars = this.records.reduce((sum, r) => sum + r.payload.length, 0);
      if (usedChars + stored.length > this.limits.maxChars) {
        return { status: "REJECTED", reason: "CHAR_QUOTA" };
      }

      const seq = this.records.reduce((max, r) => Math.max(max, r.seq), 0) + 1;
      const record: StoredRecord = {
        id: input.id,
        ownerId,
        idempotencyKey: input.idempotencyKey,
        seq,
        kind: input.kind,
        sensitive: input.sensitive,
        payload: stored,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + (input.ttlMs ?? this.defaultTtlMs),
        state: "PENDING",
        attempts: 0,
        nextAttemptAtMs: nowMs,
        finishedAtMs: null,
        deadReason: null,
      };
      await this.commit([...this.records, record]);
      return { status: "ENQUEUED", id: input.id };
    });
  }

  /**
   * Delivers due PENDING entries in sequence order. Each entry is persisted as IN_FLIGHT before
   * sending. Cancelling the signal stops before the next entry and returns an unfinished
   * entry to PENDING without counting an attempt.
   */
  async drain(send: Sender, nowMs: number, signal?: AbortSignal): Promise<DrainSummary> {
    // One drainer at a time. The send runs outside the operation lock, so a stuck send never
    // blocks enqueue, cancel, or delete.
    if (this.draining) {
      return { delivered: 0, retried: 0, dead: 0, stoppedByCancel: false };
    }
    this.draining = true;
    try {
      return await this.drainLoop(send, nowMs, signal);
    } finally {
      this.draining = false;
    }
  }

  private async drainLoop(
    send: Sender,
    nowMs: number,
    signal?: AbortSignal,
  ): Promise<DrainSummary> {
    {
      let delivered = 0;
      let retried = 0;
      let dead = 0;
      let stoppedByCancel = false;

      const due = this.records
        .filter((r) => r.state === "PENDING" && r.nextAttemptAtMs <= nowMs)
        .sort((a, b) => a.seq - b.seq);

      for (const candidate of due) {
        if (isAborted(signal)) {
          stoppedByCancel = true;
          break;
        }
        const current = this.records.find((r) => r.id === candidate.id);
        if (!current || current.state !== "PENDING") continue;

        await this.update(current.id, { state: "IN_FLIGHT" });

        let plaintext: string;
        try {
          const cipher = this.options.cipher;
          if (current.sensitive && cipher === undefined) {
            throw new Error("no cipher for sensitive entry");
          }
          plaintext =
            current.sensitive && cipher !== undefined
              ? await cipher.open(
                  current.payload,
                  aadFor({
                    ownerId: current.ownerId,
                    id: current.id,
                    idempotencyKey: current.idempotencyKey,
                  }),
                )
              : current.payload;
        } catch {
          await this.update(current.id, {
            state: "DEAD",
            payload: "",
            finishedAtMs: nowMs,
            deadReason: "DECRYPT_FAILED",
          });
          dead += 1;
          continue;
        }

        const controller = new AbortController();
        const forward = (): void => {
          controller.abort();
        };
        signal?.addEventListener("abort", forward, { once: true });
        let result: SendResult;
        try {
          result = await send(
            {
              id: current.id,
              idempotencyKey: current.idempotencyKey,
              kind: current.kind,
              payload: plaintext,
              attempt: current.attempts + 1,
            },
            controller.signal,
          );
        } catch {
          result = { ok: false, retryable: true };
        } finally {
          signal?.removeEventListener("abort", forward);
        }

        if (result.ok) {
          await this.update(current.id, { state: "DONE", payload: "", finishedAtMs: nowMs });
          delivered += 1;
          continue;
        }
        if (isAborted(signal)) {
          // Interrupted by cancellation: back to PENDING, no attempt counted.
          await this.update(current.id, { state: "PENDING" });
          stoppedByCancel = true;
          break;
        }

        const attempts = current.attempts + 1;
        if (!result.retryable) {
          await this.update(current.id, {
            state: "DEAD",
            attempts,
            payload: "",
            finishedAtMs: nowMs,
            deadReason: "PERMANENT_FAILURE",
          });
          dead += 1;
        } else if (attempts >= this.retry.maxAttempts) {
          await this.update(current.id, {
            state: "DEAD",
            attempts,
            payload: "",
            finishedAtMs: nowMs,
            deadReason: "MAX_ATTEMPTS",
          });
          dead += 1;
        } else {
          await this.update(current.id, {
            state: "PENDING",
            attempts,
            nextAttemptAtMs: nowMs + this.backoffMs(attempts),
          });
          retried += 1;
        }
      }

      return { delivered, retried, dead, stoppedByCancel };
    }
  }

  /** Delay before the next try after `attempts` failed attempts: base * factor^(attempts-1), capped. */
  backoffMs(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * this.retry.factor ** exponent);
  }

  /** Cancels a pending entry and erases its payload. An in-flight entry cannot be cancelled. */
  async cancel(id: string, nowMs: number): Promise<CancelResult> {
    return this.run(async () => {
      const current = this.records.find((r) => r.id === id);
      if (!current) return "NOT_FOUND";
      if (current.state === "IN_FLIGHT") return "IN_FLIGHT";
      if (current.state !== "PENDING") return "ALREADY_FINISHED";
      await this.replace(id, {
        state: "CANCELLED",
        payload: "",
        finishedAtMs: nowMs,
        deadReason: "CANCELLED_BY_OWNER",
      });
      return "CANCELLED";
    });
  }

  /** Removes the record completely. An in-flight entry is not removed. */
  async deletePermanently(id: string): Promise<DeleteResult> {
    return this.run(async () => {
      const current = this.records.find((r) => r.id === id);
      if (!current) return "NOT_FOUND";
      if (current.state === "IN_FLIGHT") return "IN_FLIGHT";
      await this.commit(this.records.filter((r) => r.id !== id));
      return "DELETED";
    });
  }

  /** Removes finished records past the dedupe window and pending entries past their expiry. */
  async sweep(nowMs: number): Promise<{ removed: number }> {
    return this.run(async () => {
      const kept = this.records.filter((r) => {
        if (r.state === "IN_FLIGHT") return true;
        if (r.state === "PENDING") return r.expiresAtMs > nowMs;
        return (r.finishedAtMs ?? nowMs) + this.dedupeWindowMs > nowMs;
      });
      const removed = this.records.length - kept.length;
      if (removed > 0) {
        await this.commit(kept);
      }
      return { removed };
    });
  }

  /** Counts per state, for diagnostics and quota displays. */
  stats(): Readonly<Record<EntryState, number>> {
    const counts: Record<EntryState, number> = {
      PENDING: 0,
      IN_FLIGHT: 0,
      DONE: 0,
      DEAD: 0,
      CANCELLED: 0,
    };
    for (const r of this.records) counts[r.state] += 1;
    return counts;
  }

  /** Copy of the in-memory records. Payloads of sensitive entries are still ciphertext. */
  snapshot(): readonly StoredRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  private update(id: string, patch: Partial<StoredRecord>): Promise<void> {
    return this.run(() => this.replace(id, patch));
  }

  private async replace(id: string, patch: Partial<StoredRecord>): Promise<void> {
    const next = this.records.map((r) => (r.id === id ? { ...r, ...patch } : r));
    await this.commit(next);
  }
}
