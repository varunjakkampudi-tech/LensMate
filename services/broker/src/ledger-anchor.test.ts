import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryBudgetStore, type ReserveInput } from "./budget.js";
import {
  AnchorError,
  AnchoredBudgetStore,
  FileAnchor,
  LedgerHaltedError,
  MemoryAnchor,
  checkContinuity,
  probeAnchor,
  monthOf,
  recentMonths,
  type AnchorFile,
} from "./ledger-anchor.js";

// 2026-10-24, so the current month is 2026-10.
const NOW = Date.UTC(2026, 9, 24);

function reserveInput(id: string, amountPaise = 100): ReserveInput {
  return {
    reservationId: id,
    clientId: "app-1",
    month: "2026-10",
    day: "2026-10-24",
    amountPaise,
    capPaise: 50_000,
    dailyRequestQuota: 1000,
  };
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AnchorError ? error.code : `OTHER:${String(error)}`;
  }
  return "NO_ERROR";
}

class FailingAnchor implements AnchorFile {
  read(): Promise<Record<string, number> | null> {
    return Promise.resolve(null);
  }
  write(): Promise<void> {
    return Promise.reject(new Error("disk full"));
  }
}

describe("month helpers", () => {
  it("names the UTC month and walks back across a year boundary", () => {
    expect(monthOf(Date.UTC(2026, 0, 1, 0, 0, 1))).toBe("2026-01");
    expect(recentMonths("2026-02", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});

describe("continuity check", () => {
  it("passes for an empty ledger with no anchor", async () => {
    await expect(
      checkContinuity(new InMemoryBudgetStore(), new MemoryAnchor(), NOW),
    ).resolves.toBeUndefined();
  });

  it("refuses a ledger that has spend but no anchor, so a missing anchor cannot reset the cap", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(reserveInput("a", 500));
    await store.settle("a", 500);
    expect(await errorCodeOf(checkContinuity(store, new MemoryAnchor(), NOW))).toBe(
      "NO_ANCHOR_WITH_SPEND",
    );
  });

  it("refuses spend in an older month when no anchor exists", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve({ ...reserveInput("old", 300), month: "2026-08" });
    await store.settle("old", 300);
    expect(await errorCodeOf(checkContinuity(store, new MemoryAnchor(), NOW))).toBe(
      "NO_ANCHOR_WITH_SPEND",
    );
  });

  it("passes when recorded spend matches the anchor", async () => {
    const store = new InMemoryBudgetStore();
    const anchor = new MemoryAnchor();
    await anchor.write({ "2026-10": 500 });
    await store.reserve(reserveInput("a", 500));
    await store.settle("a", 500);
    await expect(checkContinuity(store, anchor, NOW)).resolves.toBeUndefined();
  });

  it("refuses a restored ledger whose spend is below the anchored spend", async () => {
    const restoredOld = new InMemoryBudgetStore();
    const anchor = new MemoryAnchor();
    await anchor.write({ "2026-10": 1200 });
    await restoredOld.reserve(reserveInput("a", 120));
    await restoredOld.settle("a", 120);
    expect(await errorCodeOf(checkContinuity(restoredOld, anchor, NOW))).toBe("ROLLED_BACK");
  });
});

describe("file anchor", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "broker-anchor-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips the anchored months and reports a missing file as null", async () => {
    const anchor = new FileAnchor(join(dir, "missing", "anchor.json"));
    expect(await anchor.read()).toBeNull();
    await anchor.write({ "2026-10": 4200 });
    expect(await new FileAnchor(join(dir, "missing", "anchor.json")).read()).toEqual({
      "2026-10": 4200,
    });
  });

  it("refuses a corrupt, mistyped or negative anchor instead of treating it as empty", async () => {
    const path = join(dir, "bad.json");
    for (const content of [
      "not json",
      '{"version":2,"months":{}}',
      '{"version":1,"months":{"2026-10":-5}}',
      '{"version":1,"months":{"26-10":5}}',
    ]) {
      writeFileSync(path, content);
      expect(await errorCodeOf(new FileAnchor(path).read())).toBe("ANCHOR_INVALID");
    }
  });

  it("reports an anchor it cannot read as unreadable, not missing", async () => {
    const path = join(dir, "is-a-directory");
    mkdirSync(path, { recursive: true });
    expect(await errorCodeOf(new FileAnchor(path).read())).toBe("ANCHOR_UNREADABLE");
  });
});

describe("anchored ledger store", () => {
  it("records the spend of a month after each settle, never lowering the anchor", async () => {
    const anchor = new MemoryAnchor();
    const store = new AnchoredBudgetStore(new InMemoryBudgetStore(), anchor);
    await store.start();
    await store.reserve(reserveInput("a", 300));
    await store.settle("a", 120);
    expect(await anchor.read()).toEqual({ "2026-10": 120 });
    await store.reserve(reserveInput("b", 300));
    await store.release("b");
    expect(await anchor.read()).toEqual({ "2026-10": 120 });
  });

  it("halts new reservations when the anchor cannot be written, and reports the settle as failed", async () => {
    const store = new AnchoredBudgetStore(new InMemoryBudgetStore(), new FailingAnchor());
    await store.start();
    await store.reserve(reserveInput("a", 100));
    await expect(store.settle("a", 100)).rejects.toBeInstanceOf(LedgerHaltedError);
    expect(store.isHalted).toBe(true);
    await expect(store.reserve(reserveInput("c", 100))).rejects.toBeInstanceOf(LedgerHaltedError);
  });

  it("halts a reservation when recorded spend has dropped below the anchor while the broker runs", async () => {
    const anchor = new MemoryAnchor();
    await anchor.write({ "2026-10": 900 });
    const inner = new InMemoryBudgetStore();
    const store = new AnchoredBudgetStore(inner, anchor);
    await store.start();
    // Recorded spend of 50 is below the anchored 900, as if the ledger were changed under the running broker.
    await inner.reserve(reserveInput("seed", 50));
    await inner.settle("seed", 50);
    await expect(store.reserve(reserveInput("a", 50))).rejects.toBeInstanceOf(LedgerHaltedError);
    expect(store.isHalted).toBe(true);
    // The anchor is never written below its loaded value.
    expect(await anchor.read()).toEqual({ "2026-10": 900 });
  });

  it("allows a reservation when no anchor exists for the month", async () => {
    const store = new AnchoredBudgetStore(new InMemoryBudgetStore(), new MemoryAnchor());
    await store.start();
    await expect(store.reserve(reserveInput("a", 10))).resolves.toEqual({ ok: true });
  });
});

describe("startup write probe", () => {
  it("refuses an anchor location that cannot be written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-probe-"));
    try {
      const blocker = join(dir, "not-a-directory");
      writeFileSync(blocker, "x");
      const anchor = new FileAnchor(join(blocker, "anchor.json"));
      expect(await errorCodeOf(probeAnchor(anchor))).toBe("ANCHOR_WRITE_FAILED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a writable location and leaves no probe file behind", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-probe-"));
    try {
      const anchorPath = join(dir, "anchor.json");
      await expect(probeAnchor(new FileAnchor(anchorPath))).resolves.toBeUndefined();
      expect(existsSync(`${anchorPath}.probe`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
