import { InMemoryBudgetStore, type ReserveInput } from "./budget.js";

function input(overrides: Partial<ReserveInput> = {}): ReserveInput {
  return {
    reservationId: "r-1",
    clientId: "app-1",
    month: "2026-10",
    day: "2026-10-24",
    amountPaise: 10,
    capPaise: 100,
    dailyRequestQuota: 1000,
    ...overrides,
  };
}

describe("InMemoryBudgetStore: cap boundary", () => {
  it("allows a reservation that lands exactly on the cap", async () => {
    const store = new InMemoryBudgetStore();
    expect(await store.reserve(input({ reservationId: "a", amountPaise: 100 }))).toEqual({
      ok: true,
    });
    expect((await store.summary("2026-10")).reservedPaise).toBe(100);
  });

  it("refuses the reservation that would go one paisa over the cap", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 99 }));
    expect(await store.reserve(input({ reservationId: "b", amountPaise: 2 }))).toEqual({
      ok: false,
      reason: "BUDGET_EXHAUSTED",
    });
  });

  it("counts settled spend and open reservations together against the cap", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 60 }));
    await store.settle("a", 30);
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 30,
      reservedPaise: 0,
    });
    await store.reserve(input({ reservationId: "b", amountPaise: 70 }));
    expect(await store.reserve(input({ reservationId: "c", amountPaise: 1 }))).toEqual({
      ok: false,
      reason: "BUDGET_EXHAUSTED",
    });
  });

  it("frees a released reservation so the budget can be used again", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 100 }));
    await store.release("a");
    expect(await store.reserve(input({ reservationId: "b", amountPaise: 100 }))).toEqual({
      ok: true,
    });
  });

  it("starts a new month with zero spend under the same cap", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 100 }));
    await store.settle("a", 100);
    expect(
      await store.reserve(input({ reservationId: "b", month: "2026-11", amountPaise: 100 })),
    ).toEqual({
      ok: true,
    });
  });
});

describe("InMemoryBudgetStore: daily quota", () => {
  it("refuses the request after the daily quota is used, and says it is the quota", async () => {
    const store = new InMemoryBudgetStore();
    for (const id of ["a", "b", "c"]) {
      expect(
        await store.reserve(input({ reservationId: id, amountPaise: 1, dailyRequestQuota: 3 })),
      ).toEqual({
        ok: true,
      });
    }
    expect(
      await store.reserve(input({ reservationId: "d", amountPaise: 1, dailyRequestQuota: 3 })),
    ).toEqual({
      ok: false,
      reason: "QUOTA_EXCEEDED",
    });
  });

  it("keeps quotas separate for each client", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", dailyRequestQuota: 1 }));
    expect(
      await store.reserve(input({ reservationId: "b", clientId: "app-2", dailyRequestQuota: 1 })),
    ).toEqual({
      ok: true,
    });
  });
});

describe("InMemoryBudgetStore: reservation lifecycle", () => {
  it("rejects a reservation id that is already in use", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a" }));
    await expect(store.reserve(input({ reservationId: "a" }))).rejects.toThrow(/already used/);
  });

  it("rejects settling or releasing a reservation twice", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a" }));
    await store.settle("a", 5);
    await expect(store.settle("a", 5)).rejects.toThrow(/not open/);
    await expect(store.release("a")).rejects.toThrow(/not open/);
  });

  it("rejects settling a reservation that never existed", async () => {
    const store = new InMemoryBudgetStore();
    await expect(store.settle("missing", 1)).rejects.toThrow(/not open/);
  });

  it("refuses negative or non-integer amounts", async () => {
    const store = new InMemoryBudgetStore();
    await expect(store.reserve(input({ amountPaise: -1 }))).rejects.toThrow(/non-negative integer/);
    await expect(store.reserve(input({ amountPaise: 1.5 }))).rejects.toThrow(
      /non-negative integer/,
    );
    await store.reserve(input({ reservationId: "a" }));
    await expect(store.settle("a", 2.5)).rejects.toThrow(/non-negative integer/);
  });
});

describe("InMemoryBudgetStore: concurrency", () => {
  it("never lets concurrent reservations exceed the cap", async () => {
    const store = new InMemoryBudgetStore();
    const attempts = Array.from({ length: 100 }, (_, index) =>
      store.reserve(
        input({
          reservationId: `c-${String(index)}`,
          amountPaise: 10,
          capPaise: 100,
          dailyRequestQuota: 1000,
        }),
      ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((result) => result.ok)).toHaveLength(10);
    expect(
      results.filter((result) => !result.ok && result.reason === "BUDGET_EXHAUSTED"),
    ).toHaveLength(90);
    const summary = await store.summary("2026-10");
    expect(summary.reservedPaise + summary.spentPaise).toBe(100);
  });
});
