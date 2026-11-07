import type { MemoryItem } from "./vault";

/**
 * The newest saved photo from Photo & Ask (F11 quick action). Only saved captures with a picture count; notes and
 * answers without one are skipped. Returns null when nothing qualifies, so the screen can hide the shortcut.
 */
export function latestSavedPhoto(items: readonly MemoryItem[]): string | null {
  let newest: MemoryItem | null = null;
  for (const item of items) {
    if (item.kind !== "capture" || item.imageDataUrl === undefined) {
      continue;
    }
    if (newest === null || item.createdAt > newest.createdAt) {
      newest = item;
    }
  }
  return newest?.imageDataUrl ?? null;
}
