import { DEV_TEST_BUCKET, InMemoryBudgetStore, type ReserveInput } from "./budget.js";

/** Both caps apply to every paid attempt: the monthly cap always, the development-test cap when it is configured. */
function input(overrides: Partial<ReserveInput> = {}): ReserveInput {
  return {
    reservationId: "r-1",
    clientId: "app-1",
    month: "2026-10",
    day: "2026-10-24",
    amountPaise: 10,
    capPaise: 1_000,
    dailyRequestQuota: 1000,
    ...overrides,
  };
}

describe("dual cap: every paid attempt must fit both caps", () => {
  it("refuses when the monthly cap is full, even if the development cap has room", async () => {
    const store = new InMemoryBudgetStore();
    expect(
      await store.reserve(input({ reservationId: "a", capPaise: 10, devTestCapPaise: 500 })),
    ).toEqual({
      ok: true,
    });
    expect(
      await store.reserve(input({ reservationId: "b", capPaise: 10, devTestCapPaise: 500 })),
    ).toEqual({ ok: false, reason: "BUDGET_EXHAUSTED" });
  });

  it("refuses when the development cap is full, even if the monthly cap has room", async () => {
    const store = new InMemoryBudgetStore();
    expect(await store.reserve(input({ reservationId: "a", devTestCapPaise: 10 }))).toEqual({
      ok: true,
    });
    expect(await store.reserve(input({ reservationId: "b", devTestCapPaise: 10 }))).toEqual({
      ok: false,
      reason: "BUDGET_EXHAUSTED",
    });
  });

  it("charges nothing when a refusal happens, so a refused attempt cannot leave a partial reservation", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", devTestCapPaise: 10 }));
    // The monthly bucket has room, but the development bucket does not. The refused attempt must not move the monthly
    // reserved amount.
    await store.reserve(input({ reservationId: "b", devTestCapPaise: 10 }));
    expect((await store.summary("2026-10")).reservedPaise).toBe(10);
    expect((await store.summary(DEV_TEST_BUCKET)).reservedPaise).toBe(10);
  });

  it("does not reset the development bucket when the calendar month changes", async () => {
    const store = new InMemoryBudgetStore();
    expect(
      await store.reserve(input({ reservationId: "a", month: "2026-10", devTestCapPaise: 10 })),
    ).toEqual({
      ok: true,
    });
    await store.settle("a", 10);
    expect(
      await store.reserve(input({ reservationId: "b", month: "2026-11", devTestCapPaise: 10 })),
    ).toEqual({
      ok: false,
      reason: "BUDGET_EXHAUSTED",
    });
  });

  it("settles the actual cost into both buckets and frees the unused reservation", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 100, devTestCapPaise: 500 }));
    await store.settle("a", 30);
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 30,
      reservedPaise: 0,
    });
    // The development bucket is read through the same summary, keyed by its bucket name.
    expect(await store.summary(DEV_TEST_BUCKET)).toEqual({
      month: DEV_TEST_BUCKET,
      spentPaise: 30,
      reservedPaise: 0,
    });
  });

  it("releases the worst-case reservation from both buckets on failure", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 100, devTestCapPaise: 500 }));
    await store.release("a");
    expect(await store.summary("2026-10")).toEqual({
      month: "2026-10",
      spentPaise: 0,
      reservedPaise: 0,
    });
    expect(await store.summary(DEV_TEST_BUCKET)).toEqual({
      month: DEV_TEST_BUCKET,
      spentPaise: 0,
      reservedPaise: 0,
    });
  });

  it("charges only the monthly bucket when no development cap is configured", async () => {
    const store = new InMemoryBudgetStore();
    await store.reserve(input({ reservationId: "a", amountPaise: 100 }));
    expect((await store.summary(DEV_TEST_BUCKET)).reservedPaise).toBe(0);
    expect((await store.summary("2026-10")).reservedPaise).toBe(100);
  });
});
