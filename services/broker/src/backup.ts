import type { Pool } from "pg";

/**
 * Optional memory backup (OWNER-DECISION-004). The app encrypts on the phone with a key derived from a passphrase the
 * broker never sees; the broker keeps one opaque ciphertext per device and deletes it when its retention ends.
 */
export interface StoredBackup {
  readonly ciphertext: string;
  readonly updatedAt: number;
  readonly expiresAt: number;
}

export interface BackupStore {
  put(deviceId: string, ciphertext: string, nowMs: number, expiresAt: number): Promise<void>;
  /** Returns null for a missing or expired backup, deleting an expired one. */
  get(deviceId: string, nowMs: number): Promise<StoredBackup | null>;
  remove(deviceId: string): Promise<void>;
  /** Deletes every backup whose retention has ended. Run by the broker's periodic reaper. */
  purgeExpired(nowMs: number): Promise<number>;
}

export const MAX_BACKUP_CHARS = 1_000_000;
export const MAX_RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;

export function retentionExpiry(nowMs: number, days: number): number {
  return nowMs + days * DAY_MS;
}

export class InMemoryBackupStore implements BackupStore {
  private readonly rows = new Map<string, StoredBackup>();

  put(deviceId: string, ciphertext: string, nowMs: number, expiresAt: number): Promise<void> {
    this.rows.set(deviceId, { ciphertext, updatedAt: nowMs, expiresAt });
    return Promise.resolve();
  }

  get(deviceId: string, nowMs: number): Promise<StoredBackup | null> {
    const row = this.rows.get(deviceId);
    if (row === undefined || row.expiresAt <= nowMs) {
      this.rows.delete(deviceId);
      return Promise.resolve(null);
    }
    return Promise.resolve(row);
  }

  remove(deviceId: string): Promise<void> {
    this.rows.delete(deviceId);
    return Promise.resolve();
  }

  purgeExpired(nowMs: number): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.expiresAt <= nowMs) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}

export class PostgresBackupStore implements BackupStore {
  constructor(private readonly pool: Pool) {}

  async put(deviceId: string, ciphertext: string, nowMs: number, expiresAt: number): Promise<void> {
    await this.pool.query(
      "INSERT INTO broker_memory_backup (device_id, ciphertext, updated_at, expires_at) " +
        "VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0)) " +
        "ON CONFLICT (device_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, " +
        "updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at",
      [deviceId, ciphertext, nowMs, expiresAt],
    );
  }

  async get(deviceId: string, nowMs: number): Promise<StoredBackup | null> {
    await this.pool.query(
      "DELETE FROM broker_memory_backup WHERE expires_at <= to_timestamp($1 / 1000.0)",
      [nowMs],
    );
    const result = await this.pool.query<{ ciphertext: string; updated: string; expires: string }>(
      "SELECT ciphertext, (extract(epoch FROM updated_at) * 1000)::bigint AS updated, " +
        "(extract(epoch FROM expires_at) * 1000)::bigint AS expires FROM broker_memory_backup WHERE device_id = $1",
      [deviceId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          ciphertext: row.ciphertext,
          updatedAt: Number(row.updated),
          expiresAt: Number(row.expires),
        };
  }

  async remove(deviceId: string): Promise<void> {
    await this.pool.query("DELETE FROM broker_memory_backup WHERE device_id = $1", [deviceId]);
  }

  async purgeExpired(nowMs: number): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM broker_memory_backup WHERE expires_at <= to_timestamp($1 / 1000.0)",
      [nowMs],
    );
    return result.rowCount ?? 0;
  }
}
