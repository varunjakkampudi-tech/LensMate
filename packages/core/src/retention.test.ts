import {
  TEMPORARY_RETENTION_MS,
  isTemporaryItemExpired,
  sweepTemporaryItems,
} from "./retention.js";
import type { TemporaryItem } from "./retention.js";

const CREATED = 1_000_000;

function item(id: string, overrides: Partial<TemporaryItem> = {}): TemporaryItem {
  return { id, createdAtMs: CREATED, sessionEnded: false, ...overrides };
}

describe("temporary item retention", () => {
  it("keeps an item younger than 24 hours while its session is open", () => {
    expect(isTemporaryItemExpired(item("a"), CREATED + TEMPORARY_RETENTION_MS - 1)).toBe(false);
  });

  it("expires an item at exactly 24 hours", () => {
    expect(isTemporaryItemExpired(item("a"), CREATED + TEMPORARY_RETENTION_MS)).toBe(true);
  });

  it("expires an item as soon as its session ends, even when it is young", () => {
    expect(isTemporaryItemExpired(item("a", { sessionEnded: true }), CREATED)).toBe(true);
  });

  it("sweeps expired items out and keeps the rest", () => {
    const items = [
      item("young"),
      item("old", { createdAtMs: CREATED - TEMPORARY_RETENTION_MS }),
      item("ended", { sessionEnded: true }),
    ];
    const { keep, expired } = sweepTemporaryItems(items, CREATED + 1);
    expect(keep.map((i) => i.id)).toEqual(["young"]);
    expect(expired.map((i) => i.id)).toEqual(["old", "ended"]);
  });

  it("expires an item whose creation time is not a finite number, so it is never kept forever", () => {
    expect(isTemporaryItemExpired(item("nan", { createdAtMs: Number.NaN }), CREATED)).toBe(true);
    expect(
      isTemporaryItemExpired(item("inf", { createdAtMs: Number.POSITIVE_INFINITY }), CREATED),
    ).toBe(true);
  });

  it("returns empty lists for no items", () => {
    expect(sweepTemporaryItems([], CREATED)).toEqual({ keep: [], expired: [] });
  });
});
