import { latestSavedPhoto } from "./last-photo";
import type { MemoryItem } from "./vault";

function item(overrides: Partial<MemoryItem>): MemoryItem {
  return { id: "x", kind: "capture", title: "t", text: "t", createdAt: 1, ...overrides };
}

describe("latestSavedPhoto", () => {
  it("returns the picture of the newest saved capture, whatever the storage order", () => {
    const items = [
      item({ id: "old", createdAt: 10, imageDataUrl: "data:image/jpeg;base64,OLD" }),
      item({ id: "new", createdAt: 30, imageDataUrl: "data:image/jpeg;base64,NEW" }),
      item({ id: "mid", createdAt: 20, imageDataUrl: "data:image/jpeg;base64,MID" }),
    ];
    expect(latestSavedPhoto(items)).toBe("data:image/jpeg;base64,NEW");
  });

  it("skips notes, answers and captures without a picture", () => {
    const items = [
      item({ kind: "note", createdAt: 90, imageDataUrl: "data:image/jpeg;base64,NOTE" }),
      item({ kind: "answer", createdAt: 80, imageDataUrl: "data:image/jpeg;base64,ANS" }),
      item({ kind: "capture", createdAt: 70 }),
      item({ kind: "capture", createdAt: 5, imageDataUrl: "data:image/jpeg;base64,KEEP" }),
    ];
    expect(latestSavedPhoto(items)).toBe("data:image/jpeg;base64,KEEP");
  });

  it("returns null when there is nothing to reopen", () => {
    expect(latestSavedPhoto([])).toBeNull();
    expect(latestSavedPhoto([item({ kind: "note" })])).toBeNull();
  });
});
