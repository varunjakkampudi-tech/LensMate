/**
 * Per-process rate limit and concurrency guard. Both are in memory, so they hold for one broker process. The
 * single-instance VPS deployment (deploy/README.md) is the supported topology; a second instance needs these
 * counters moved to the database before it is added.
 */
export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updatedMs: number }>();

  /**
   * `maxKeys` bounds memory when keys come from many clients. When the bound is reached the oldest key is dropped, so
   * the oldest clients get a fresh bucket. A flood of new keys therefore cannot exhaust memory.
   */
  constructor(
    private readonly burst: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Takes one token for `key`. Returns false when the client is over its rate. */
  take(key: string): boolean {
    const nowMs = this.now();
    const existing = this.buckets.get(key);
    if (existing === undefined && this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done !== true) {
        this.buckets.delete(oldest.value);
      }
    }
    const bucket = existing ?? { tokens: this.burst, updatedMs: nowMs };
    const elapsedSeconds = (nowMs - bucket.updatedMs) / 1000;
    bucket.tokens = Math.min(this.burst, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.updatedMs = nowMs;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }
}

/** Limits in-flight provider work per client and in total. `acquire` returns a release function, or null. */
export class ConcurrencyGuard {
  private total = 0;
  private readonly perClient = new Map<string, number>();

  constructor(
    private readonly maxPerClient: number,
    private readonly maxTotal: number,
  ) {}

  acquire(clientId: string): (() => void) | null {
    const current = this.perClient.get(clientId) ?? 0;
    if (current >= this.maxPerClient || this.total >= this.maxTotal) {
      return null;
    }
    this.perClient.set(clientId, current + 1);
    this.total += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.total -= 1;
      const left = (this.perClient.get(clientId) ?? 1) - 1;
      if (left === 0) {
        this.perClient.delete(clientId);
      } else {
        this.perClient.set(clientId, left);
      }
    };
  }

  get inFlight(): number {
    return this.total;
  }
}
