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
  checkRevocations,
  syncRevocations,
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
  revokedDevices(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  recordRevocation(): Promise<void> {
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
  it("passes an empty ledger with no anchor only for a first start the owner asked for", async () => {
    await expect(
      checkContinuity(new InMemoryBudgetStore(), new MemoryAnchor(), NOW, { genesis: true }),
    ).resolves.toBe(true);
    expect(
      await errorCodeOf(checkContinuity(new InMemoryBudgetStore(), new MemoryAnchor(), NOW)),
    ).toBe("NO_ANCHOR");
  });

  it("treats an anchor that records no months as absent, so it cannot prove a rollback baseline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-empty-anchor-"));
    try {
      const path = join(dir, "anchor.json");
      writeFileSync(path, JSON.stringify({ version: 1, months: {}, revoked: [] }));
      const store = new InMemoryBudgetStore();
      await store.reserve(reserveInput("seed", 5000));
      await store.settle("seed", 5000);
      expect(
        await errorCodeOf(checkContinuity(store, new FileAnchor(path), NOW, { genesis: true })),
      ).toBe("NO_ANCHOR_WITH_SPEND");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records revocations and keeps them when spend is written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-revoke-"));
    try {
      const anchor = new FileAnchor(join(dir, "anchor.json"));
      const device = "11111111-2222-4333-8444-555555555555";
      await anchor.recordRevocation(device);
      await anchor.write({ "2026-10": 100 });
      expect(await anchor.revokedDevices()).toEqual([device]);
      expect(await anchor.read()).toEqual({ "2026-10": 100 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses to start when a revoked device is active again in the database (restored backup)", async () => {
    const anchor = new MemoryAnchor();
    const device = "11111111-2222-4333-8444-555555555555";
    await anchor.recordRevocation(device);
    const active = { findDevice: () => Promise.resolve({ revoked: false }) };
    expect(await errorCodeOf(checkRevocations(active, anchor))).toBe("REVOCATION_ROLLED_BACK");
    const missing = { findDevice: () => Promise.resolve(undefined) };
    expect(await errorCodeOf(checkRevocations(missing, anchor))).toBe("REVOCATION_ROLLED_BACK");
    const revoked = { findDevice: () => Promise.resolve({ revoked: true }) };
    await expect(checkRevocations(revoked, anchor)).resolves.toBeUndefined();
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
    await expect(checkContinuity(store, anchor, NOW)).resolves.toBe(false);
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

describe("anchor writes under concurrency", () => {
  it("ends with the anchor at the final recorded spend when settlements finish out of order", async () => {
    const anchor = new MemoryAnchor();
    const inner = new InMemoryBudgetStore();
    const store = new AnchoredBudgetStore(inner, anchor);
    await store.start();
    for (const id of ["a", "b", "c"]) {
      await store.reserve(reserveInput(id, 100));
    }
    await Promise.all([store.settle("a", 100), store.settle("b", 100), store.settle("c", 100)]);
    expect(await anchor.read()).toEqual({ "2026-10": 300 });
    expect((await inner.summary("2026-10")).spentPaise).toBe(300);
  });
});

describe("genesis marker", () => {
  function marker(initiallyRecorded: boolean) {
    let recorded = initiallyRecorded;
    return {
      isRecorded: () => Promise.resolve(recorded),
      record: () => {
        const first = !recorded;
        recorded = true;
        return Promise.resolve(first);
      },
    };
  }

  it("records the genesis on the first start and then refuses a missing anchor, even with the flag still set", async () => {
    const store = new InMemoryBudgetStore();
    const flagged = marker(false);
    // The check reports that a genesis is pending; the caller records it once the first anchor is written.
    await expect(
      checkContinuity(store, new MemoryAnchor(), NOW, { genesis: true, marker: flagged }),
    ).resolves.toBe(true);
    await flagged.record();
    // The environment still says genesis (a restart), but the ledger has started: a lost anchor must refuse.
    expect(
      await errorCodeOf(
        checkContinuity(store, new MemoryAnchor(), NOW, { genesis: true, marker: flagged }),
      ),
    ).toBe("NO_ANCHOR");
  });

  it("refuses a missing anchor on a started ledger even when the empty backup is restored", async () => {
    expect(
      await errorCodeOf(
        checkContinuity(new InMemoryBudgetStore(), new MemoryAnchor(), NOW, {
          genesis: true,
          marker: marker(true),
        }),
      ),
    ).toBe("NO_ANCHOR");
  });
});

describe("revocation record and mount checks", () => {
  it("refuses to record a revocation when the anchor directory is not mounted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-mount-"));
    try {
      const anchor = new FileAnchor(join(dir, "missing-mount", "anchor.json"));
      expect(
        await errorCodeOf(anchor.recordRevocation("11111111-2222-4333-8444-555555555555")),
      ).toBe("ANCHOR_WRITE_FAILED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records in the anchor any device the database shows as revoked", async () => {
    const anchor = new MemoryAnchor();
    const revokedInDb = "11111111-2222-4333-8444-555555555555";
    const activeInDb = "66666666-7777-4888-8999-aaaaaaaaaaaa";
    const devices = {
      listDevices: () =>
        Promise.resolve([
          { deviceId: revokedInDb, revoked: true },
          { deviceId: activeInDb, revoked: false },
        ]),
    };
    await syncRevocations(devices, anchor);
    expect(await anchor.revokedDevices()).toEqual([revokedInDb]);
  });
});

describe("separate-mount requirement and the cross-process lock", () => {
  it("refuses a revocation when the anchor directory shares a device with its parent (not a volume)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-requiremount-"));
    try {
      const anchor = new FileAnchor(join(dir, "anchor.json"), { requireMount: true });
      expect(
        await errorCodeOf(anchor.recordRevocation("11111111-2222-4333-8444-555555555555")),
      ).toBe("ANCHOR_WRITE_FAILED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a write while another writer holds the lock, and never writes unlocked", async () => {
    const dir = mkdtempSync(join(tmpdir(), "broker-lock-"));
    try {
      const path = join(dir, "anchor.json");
      writeFileSync(`${path}.lock`, "held");
      const anchor = new FileAnchor(path, { requireMount: false, lockTimeoutMs: 100 });
      expect(await errorCodeOf(anchor.write({ "2026-10": 1 }))).toBe("ANCHOR_WRITE_FAILED");
      expect(existsSync(path)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
