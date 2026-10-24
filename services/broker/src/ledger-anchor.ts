import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BudgetStore, BudgetSummary, ReserveInput, ReserveResult } from "./budget.js";

/**
 * Spend continuity (BLOCKER-006, fail-closed restoration).
 *
 * The ledger in PostgreSQL can be rolled back by restoring an old backup or by a wrong manual change. Nothing inside the
 * database can detect that, because an old copy is internally consistent. So after every change to recorded spend the
 * broker writes the spend it has recorded per month to an anchor file on a separate volume. A backup restore does not
 * touch that volume. At start-up, and whenever the anchor cannot be trusted, the broker checks that the database still
 * holds at least the anchored spend for every month. If it does not, the broker refuses to start, and it halts new
 * reservations if an anchor write fails.
 *
 * The invariant is "database spend >= anchored spend". Writes that land in the database but not yet in the anchor
 * (a crash in between) only make the anchor lag, which is safe. The owner recovers after a restore by raising recorded
 * spend to the anchored value, or to the provider-billed amount if higher. The spend trigger allows an increase, never a
 * decrease. The anchor only proves what the broker itself recorded. An attacker who controls the server can edit it,
 * which is a stated residual risk.
 */

/** Months checked when no anchor exists yet: the current month and the twelve before it. */
const LOOKBACK_MONTHS = 12;

export interface AnchorFile {
  /** Null when no anchor has been written. Throws when the anchor exists but cannot be read or parsed. */
  read(): Promise<Record<string, number> | null>;
  write(months: Readonly<Record<string, number>>): Promise<void>;
}

/** Checks that the anchor location can be written, so a read-only or unowned volume stops start-up, not a billed call. */
export async function probeAnchor(
  anchor: AnchorFile & { probe?: () => Promise<void> },
): Promise<void> {
  if (anchor.probe !== undefined) {
    await anchor.probe();
  }
}

/** Writes JSON through a temporary file and a rename, so a crash never leaves a half-written anchor. */
export class FileAnchor implements AnchorFile {
  constructor(private readonly path: string) {}

  read(): Promise<Record<string, number> | null> {
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return Promise.resolve(null);
      }
      return Promise.reject(new AnchorError("ANCHOR_UNREADABLE"));
    }
    try {
      return Promise.resolve(parseAnchor(raw));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new AnchorError("ANCHOR_INVALID"));
    }
  }

  /** Writes and removes a probe file next to the anchor. Rejects with ANCHOR_WRITE_FAILED when that is not possible. */
  probe(): Promise<void> {
    const probePath = `${this.path}.probe`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(probePath, "ok", { mode: 0o600 });
      rmSync(probePath);
      return Promise.resolve();
    } catch {
      return Promise.reject(new AnchorError("ANCHOR_WRITE_FAILED"));
    }
  }

  write(months: Readonly<Record<string, number>>): Promise<void> {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, months }), { mode: 0o600, flag: "w" });
      renameSync(temporary, this.path);
      return Promise.resolve();
    } catch {
      return Promise.reject(new AnchorError("ANCHOR_WRITE_FAILED"));
    }
  }
}

/** In-memory anchor, for tests and the mock mode without a database. */
export class MemoryAnchor implements AnchorFile {
  private stored: Record<string, number> | null = null;

  read(): Promise<Record<string, number> | null> {
    return Promise.resolve(this.stored === null ? null : { ...this.stored });
  }

  write(months: Readonly<Record<string, number>>): Promise<void> {
    this.stored = { ...months };
    return Promise.resolve();
  }
}

export class AnchorError extends Error {
  constructor(
    readonly code:
      | "ANCHOR_UNREADABLE"
      | "ANCHOR_WRITE_FAILED"
      | "ANCHOR_INVALID"
      | "ROLLED_BACK"
      | "NO_ANCHOR_WITH_SPEND",
  ) {
    super(code);
    this.name = "AnchorError";
  }
}

function parseAnchor(raw: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AnchorError("ANCHOR_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AnchorError("ANCHOR_INVALID");
  }
  const candidate = parsed as { version?: unknown; months?: unknown };
  if (
    candidate.version !== 1 ||
    typeof candidate.months !== "object" ||
    candidate.months === null
  ) {
    throw new AnchorError("ANCHOR_INVALID");
  }
  const result: Record<string, number> = {};
  for (const [month, value] of Object.entries(candidate.months)) {
    if (
      !/^\d{4}-\d{2}$/.test(month) ||
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new AnchorError("ANCHOR_INVALID");
    }
    result[month] = value;
  }
  return result;
}

/** The calendar month (UTC, "YYYY-MM") that holds `nowMs`. */
export function monthOf(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

/** `month` and the months before it, newest first, `count` in total. */
export function recentMonths(month: string, count: number): string[] {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const index = Number(monthText) - 1;
  const months: string[] = [];
  for (let step = 0; step < count; step += 1) {
    const total = year * 12 + index - step;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    months.push(`${String(y)}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

/**
 * Compares the database with the anchor. Throws AnchorError when continuity cannot be shown. Nothing is changed.
 * With an anchor, every anchored month must hold at least the anchored spend. Without one, every recent month must be
 * zero, so a ledger with history cannot start without a verified anchor.
 */
export async function checkContinuity(
  budget: Pick<BudgetStore, "summary">,
  anchor: AnchorFile,
  nowMs: number,
): Promise<void> {
  const anchored = await anchor.read();
  if (anchored === null) {
    for (const month of recentMonths(monthOf(nowMs), LOOKBACK_MONTHS + 1)) {
      const summary = await budget.summary(month);
      if (summary.spentPaise > 0 || summary.reservedPaise > 0) {
        throw new AnchorError("NO_ANCHOR_WITH_SPEND");
      }
    }
    return;
  }
  for (const [month, spent] of Object.entries(anchored)) {
    const summary = await budget.summary(month);
    if (summary.spentPaise < spent) {
      throw new AnchorError("ROLLED_BACK");
    }
  }
}

export class LedgerHaltedError extends Error {
  constructor() {
    super("ledger halted: spend anchor could not be written");
    this.name = "LedgerHaltedError";
  }
}

/**
 * Wraps the ledger. After each settle or release it records the spend of the reservation's month in the anchor. If that
 * write fails, reservations stop until the broker restarts and the continuity check passes again. Failing closed here
 * means spend is never recorded in the database without a matching anchor.
 */
export class AnchoredBudgetStore implements BudgetStore {
  private halted = false;
  private readonly monthOfReservation = new Map<string, string>();
  private anchored: Record<string, number> = {};

  constructor(
    private readonly inner: BudgetStore,
    private readonly anchor: AnchorFile,
  ) {}

  /** Loads the current anchor values. Call once, after the continuity check passed. */
  async start(): Promise<void> {
    this.anchored = (await this.anchor.read()) ?? {};
  }

  get isHalted(): boolean {
    return this.halted;
  }

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    if (this.halted) {
      throw new LedgerHaltedError();
    }
    // Runtime continuity: recorded spend below the anchor means the ledger was changed under a running broker.
    // Halt rather than admit a provider call against a lowered value.
    const anchoredSpend = this.anchored[input.month] ?? 0;
    if (anchoredSpend > 0) {
      const summary = await this.inner.summary(input.month);
      if (summary.spentPaise < anchoredSpend) {
        this.halted = true;
        throw new LedgerHaltedError();
      }
    }
    const result = await this.inner.reserve(input);
    if (result.ok) {
      this.monthOfReservation.set(input.reservationId, input.month);
    }
    return result;
  }

  async settle(reservationId: string, actualPaise: number): Promise<void> {
    await this.inner.settle(reservationId, actualPaise);
    await this.record(reservationId);
  }

  async release(reservationId: string): Promise<void> {
    await this.inner.release(reservationId);
    await this.record(reservationId);
  }

  summary(month: string): Promise<BudgetSummary> {
    return this.inner.summary(month);
  }

  ping(): Promise<void> {
    return this.inner.ping();
  }

  /** Records the current spend of `month`. Used after the reaper settles stale reservations. */
  async refresh(month: string): Promise<void> {
    await this.writeMonth(month);
  }

  /** The anchored spend per month, as loaded and last written. */
  get anchoredMonths(): Readonly<Record<string, number>> {
    return this.anchored;
  }

  private async record(reservationId: string): Promise<void> {
    const month = this.monthOfReservation.get(reservationId);
    this.monthOfReservation.delete(reservationId);
    if (month !== undefined) {
      await this.writeMonth(month);
    }
  }

  private async writeMonth(month: string): Promise<void> {
    const summary = await this.inner.summary(month);
    const next = {
      ...this.anchored,
      [month]: Math.max(this.anchored[month] ?? 0, summary.spentPaise),
    };
    try {
      await this.anchor.write(next);
      this.anchored = next;
    } catch {
      this.halted = true;
      throw new LedgerHaltedError();
    }
  }
}
