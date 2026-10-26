import { Platform } from "react-native";
import { listItems, loadState, saveItem, saveState } from "./vault";
import { nativeMemory } from "./native-store";

jest.mock("./native-store", () => ({
  nativeMemory: jest.fn(),
}));

const nativeMemoryMock = jest.mocked(nativeMemory);

describe("vault state rows", () => {
  const rows: string[] = [];
  let platform: string;
  let store: {
    newId: jest.Mock<Promise<string>>;
    save: jest.Mock<Promise<void>, [{ id: string; createdAt: number; body: string }]>;
    list: jest.Mock<Promise<string[]>>;
    remove: jest.Mock<Promise<void>>;
    removeAll: jest.Mock<Promise<void>>;
  };

  beforeAll(() => {
    platform = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => platform });
  });

  beforeEach(() => {
    rows.splice(0, rows.length);
    platform = "ios";
    store = {
      newId: jest.fn(async () => "generated-id"),
      save: jest.fn(async ({ body }: { id: string; createdAt: number; body: string }) => {
        const item = JSON.parse(body) as { id: string };
        const index = rows.findIndex((row) => (JSON.parse(row) as { id: string }).id === item.id);
        if (index === -1) rows.push(body);
        else rows[index] = body;
      }),
      list: jest.fn(async () => [...rows]),
      remove: jest.fn(async () => undefined),
      removeAll: jest.fn(async () => {
        rows.splice(0, rows.length);
      }),
    };
    nativeMemoryMock.mockReturnValue(store);
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: platform });
  });

  it("saves and loads state through the encrypted store as a state row", async () => {
    const value = { enabled: true, threshold: 3 };
    await saveState("automation", value);

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(rows[0] ?? "null")).toMatchObject({
      id: "state:automation",
      kind: "state",
      title: "automation",
    });
    await expect(loadState<typeof value>("automation")).resolves.toEqual(value);
  });

  it("returns null for an unknown state key", async () => {
    await expect(loadState("missing")).resolves.toBeNull();
  });

  it("does not list state rows alongside normal memory items", async () => {
    await saveState("automation", { enabled: true });
    await saveItem({ kind: "note", title: "Note", text: "Remember this", id: "note-1" });

    await expect(listItems()).resolves.toMatchObject([{ id: "note-1", kind: "note" }]);
  });

  it("returns null when a matching state row has corrupt JSON content", async () => {
    rows.push(
      JSON.stringify({
        id: "state:broken",
        kind: "state",
        title: "broken",
        text: "{invalid",
        createdAt: 0,
      }),
    );

    await expect(loadState("broken")).resolves.toBeNull();
  });

  it("does not save state on web", async () => {
    platform = "web";

    await expect(saveState("automation", { enabled: true })).resolves.toBeUndefined();
    expect(store.save).not.toHaveBeenCalled();
  });
});
