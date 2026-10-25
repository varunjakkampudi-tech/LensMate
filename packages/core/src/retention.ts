/**
 * Retention for temporary captures (v9 G13, G34; Engineering Standards 4).
 * Temporary items (photos, audio, frames, translation text) live on the phone only and expire after
 * 24 hours or at session end, whichever comes first. Saved notes and memories are not handled here:
 * they stay until the user deletes them.
 */
export const TEMPORARY_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface TemporaryItem {
  readonly id: string;
  readonly createdAtMs: number;
  readonly sessionEnded: boolean;
}

/**
 * Fails closed: an item is expired when the clock or its creation time cannot be read, or when it claims to be
 * created in the future, so a bad value can never keep it.
 */
export function isTemporaryItemExpired(item: TemporaryItem, nowMs: number): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(item.createdAtMs) || item.createdAtMs > nowMs) {
    return true;
  }
  return item.sessionEnded || nowMs - item.createdAtMs >= TEMPORARY_RETENTION_MS;
}

/** Splits items into those to keep and those to delete now. Pure: the caller performs the deletion. */
export function sweepTemporaryItems(
  items: readonly TemporaryItem[],
  nowMs: number,
): { keep: TemporaryItem[]; expired: TemporaryItem[] } {
  const keep: TemporaryItem[] = [];
  const expired: TemporaryItem[] = [];
  for (const item of items) {
    (isTemporaryItemExpired(item, nowMs) ? expired : keep).push(item);
  }
  return { keep, expired };
}
