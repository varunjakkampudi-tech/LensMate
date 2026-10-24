import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
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

/** The anchored state: recorded spend per month, and the devices the broker has recorded as revoked. */
export interface AnchorState {
  readonly months: Readonly<Record<string, number>>;
  readonly revoked: readonly string[];
}

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AnchorFile {
  /**
   * Null when no anchor has been written, or when it records no months: an empty anchor proves nothing, so it is treated
   * as absent. Rejects when the anchor exists but cannot be read or parsed.
   */
  read(): Promise<Record<string, number> | null>;
  write(months: Readonly<Record<string, number>>): Promise<void>;
  /** Devices recorded as revoked. Empty when none. */
  revokedDevices(): Promise<readonly string[]>;
  /** Records a revocation, so a restore that brings the device back is detected at start-up. */
  recordRevocation(deviceId: string): Promise<void>;
}

/** Runs a synchronous file operation and turns any throw into a rejected promise with an AnchorError when needed. */
function settle<T>(operation: () => T): Promise<T> {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new AnchorError("ANCHOR_INVALID"));
  }
}

/** Checks that the anchor location can be written, so a read-only or unowned volume stops start-up, not a billed call. */
export async function probeAnchor(anchor: { probe?: () => Promise<void> }): Promise<void> {
  if (anchor.probe !== undefined) {
    await anchor.probe();
  }
}

/** Writes JSON through a temporary file, flushed before the rename, so a crash never leaves a partial anchor. */
export class FileAnchor implements AnchorFile {
  constructor(private readonly path: string) {}

  read(): Promise<Record<string, number> | null> {
    return settle(() => {
      const state = this.readState();
      return state === null || Object.keys(state.months).length === 0 ? null : { ...state.months };
    });
  }

  revokedDevices(): Promise<readonly string[]> {
    return settle(() => this.readState()?.revoked ?? []);
  }

  recordRevocation(deviceId: string): Promise<void> {
    return settle(() => {
      const state = this.readState();
      const revoked = [...new Set([...(state?.revoked ?? []), deviceId])];
      this.persist({ months: state?.months ?? {}, revoked });
    });
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
    return settle(() => {
      const revoked = this.readState()?.revoked ?? [];
      this.persist({ months, revoked });
    });
  }

  private readState(): AnchorState | null {
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new AnchorError("ANCHOR_UNREADABLE");
    }
    return parseAnchor(raw);
  }

  private persist(state: AnchorState): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      const descriptor = openSync(temporary, "w", 0o600);
      try {
        writeSync(descriptor, JSON.stringify({ version: 1, ...state }));
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      renameSync(temporary, this.path);
    } catch {
      throw new AnchorError("ANCHOR_WRITE_FAILED");
    }
  }
}

/** In-memory anchor, for tests and the mock mode without a database. */
export class MemoryAnchor implements AnchorFile {
  private months: Record<string, number> = {};
  private revoked: string[] = [];

  read(): Promise<Record<string, number> | null> {
    return Promise.resolve(Object.keys(this.months).length === 0 ? null : { ...this.months });
  }

  write(months: Readonly<Record<string, number>>): Promise<void> {
    this.months = { ...months };
    return Promise.resolve();
  }

  revokedDevices(): Promise<readonly string[]> {
    return Promise.resolve([...this.revoked]);
  }

  recordRevocation(deviceId: string): Promise<void> {
    this.revoked = [...new Set([...this.revoked, deviceId])];
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
      | "NO_ANCHOR"
      | "NO_ANCHOR_WITH_SPEND"
      | "REVOCATION_ROLLED_BACK",
  ) {
    super(code);
    this.name = "AnchorError";
  }
}

function parseAnchor(raw: string): AnchorState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AnchorError("ANCHOR_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AnchorError("ANCHOR_INVALID");
  }
  const candidate = parsed as { version?: unknown; months?: unknown; revoked?: unknown };
  if (
    candidate.version !== 1 ||
    typeof candidate.months !== "object" ||
    candidate.months === null ||
    Array.isArray(candidate.months)
  ) {
    throw new AnchorError("ANCHOR_INVALID");
  }
  const months: Record<string, number> = {};
  for (const [month, value] of Object.entries(candidate.months)) {
    if (
      !/^\d{4}-\d{2}$/.test(month) ||
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new AnchorError("ANCHOR_INVALID");
    }
    months[month] = value;
  }
  const revoked = candidate.revoked ?? [];
  if (
    !Array.isArray(revoked) ||
    !revoked.every((id) => typeof id === "string" && DEVICE_ID.test(id))
  ) {
    throw new AnchorError("ANCHOR_INVALID");
  }
  return { months, revoked: revoked as string[] };
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
/**
 * The database's record that a ledger has started (broker_ledger_genesis). Once recorded, a missing anchor is never
 * a first start, whatever the environment says.
 */
export interface LedgerMarker {
  isRecorded(): Promise<boolean>;
  /** Records the genesis. Returns true only when this call recorded it. */
  record(): Promise<boolean>;
}

export async function checkContinuity(
  budget: Pick<BudgetStore, "summary">,
  anchor: AnchorFile,
  nowMs: number,
  options: { readonly genesis: boolean; readonly marker?: LedgerMarker } = { genesis: false },
): Promise<void> {
  const anchored = await anchor.read();
  if (anchored === null) {
    for (const month of recentMonths(monthOf(nowMs), LOOKBACK_MONTHS + 1)) {
      const summary = await budget.summary(month);
      if (summary.spentPaise > 0 || summary.reservedPaise > 0) {
        throw new AnchorError("NO_ANCHOR_WITH_SPEND");
      }
    }
    // A missing anchor is accepted only for the first start of an empty ledger that the owner asked for. Once the
    // ledger has started (recorded in the database), a missing anchor refuses, so a lost anchor cannot reset the ledger.
    if (options.marker !== undefined && (await options.marker.isRecorded())) {
      throw new AnchorError("NO_ANCHOR");
    }
    if (!options.genesis) {
      throw new AnchorError("NO_ANCHOR");
    }
    await options.marker?.record();
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
  private writeQueue: Promise<void> = Promise.resolve();

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

  /** Writes are queued, so two settlements never race to publish older values over newer ones. */
  private writeMonth(month: string): Promise<void> {
    const write = this.writeQueue.then(() => this.writeMonthNow(month));
    this.writeQueue = write.catch(() => undefined);
    return write;
  }

  private async writeMonthNow(month: string): Promise<void> {
    const summary = await this.inner.summary(month);
    // The maximum is taken after the read and after any earlier queued write, never from a stale copy.
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

/**
 * Every device recorded as revoked must still be revoked in the database. A restore of an older database brings
 * revoked devices back as active; this refuses to start until the owner revokes them again.
 */
export async function checkRevocations(
  devices: { findDevice(deviceId: string): Promise<{ revoked: boolean } | undefined> },
  anchor: AnchorFile,
): Promise<void> {
  for (const deviceId of await anchor.revokedDevices()) {
    const device = await devices.findDevice(deviceId);
    if (device === undefined || !device.revoked) {
      throw new AnchorError("REVOCATION_ROLLED_BACK");
    }
  }
}
