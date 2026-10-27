import { openItems, sealItems } from "./backup";
import type { MemoryItem } from "./vault";

jest.mock("../broker-call", () => ({ callBrokerBackup: jest.fn() }));

const items: MemoryItem[] = [
  { id: "1", kind: "note", title: "Parking", text: "Level 2, B14", createdAt: 1 },
];

describe("memory backup encryption", () => {
  it("round-trips with the right passphrase and never contains the plain text", async () => {
    const sealed = await sealItems(items, "correct horse battery");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("Parking");
    expect(sealed).toMatch(/^[A-Za-z0-9+/=.:_-]+$/);
    await expect(openItems(sealed, "correct horse battery")).resolves.toEqual(items);
  });

  it("refuses a wrong passphrase and a malformed backup", async () => {
    const sealed = await sealItems(items, "correct horse battery");
    await expect(openItems(sealed, "wrong passphrase!")).rejects.toThrow("BACKUP_PASSPHRASE");
    await expect(openItems("v2.a.b.c", "x")).rejects.toThrow("BACKUP_FORMAT");
  });

  it("uses a fresh salt and nonce for every backup", async () => {
    const a = await sealItems(items, "same passphrase");
    const b = await sealItems(items, "same passphrase");
    expect(a).not.toBe(b);
  });
});
