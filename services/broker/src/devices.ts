import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

/**
 * Per-device authentication (BLOCKER-006 item 3). No secret is shared between devices, and none is embedded in the
 * mobile app. A device enrols once with a single-use, short-lived code that the owner issues on the server. The
 * broker then gives the device its own random secret, which it stores only as a SHA-256 hash. Each device can be
 * revoked on its own. The device id is also the quota and accounting key.
 *
 * Enrolment codes carry about 78 random bits (16 characters from a 30-character alphabet), shown once, stored as hashes, single-use and expire after ten minutes.
 */
export const ENROLMENT_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const LABEL_PATTERN = /^[A-Za-z0-9 ._-]{1,64}$/;

export interface DeviceRecord {
  readonly deviceId: string;
  readonly label: string;
  readonly secretSha256: string;
  readonly revoked: boolean;
}

export interface DeviceSummary {
  readonly deviceId: string;
  readonly label: string;
  readonly revoked: boolean;
}

export interface DeviceStore {
  /** Stores the hash of a new enrolment code, valid until `expiresAtMs`. */
  addEnrolmentCode(codeSha256: string, expiresAtMs: number): Promise<void>;
  /**
   * Atomically consumes an unused, unexpired enrolment code and registers the device. Returns false when the code is
   * unknown, already used, or expired. Nothing is registered in that case.
   */
  redeemEnrolmentCode(
    codeSha256: string,
    nowMs: number,
    device: { deviceId: string; label: string; secretSha256: string },
  ): Promise<boolean>;
  findDevice(deviceId: string): Promise<DeviceRecord | undefined>;
  /** Marks a device revoked. Returns false when no such device exists. */
  revokeDevice(deviceId: string): Promise<boolean>;
  listDevices(): Promise<DeviceSummary[]>;
}

export interface NewEnrolment {
  /** Shown once to the owner. Never stored. */
  readonly code: string;
  readonly codeSha256: string;
  readonly expiresAtMs: number;
}

/** Creates a human-enterable code, grouped as XXXX-XXXX-XXXX-XXXX, and its hash. */
export function newEnrolmentCode(nowMs: number): NewEnrolment {
  const bytes = randomBytes(16);
  let raw = "";
  for (let index = 0; index < 16; index += 1) {
    raw += CODE_ALPHABET.charAt(bytes.readUInt8(index) % CODE_ALPHABET.length);
  }
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  return {
    code,
    codeSha256: sha256Hex(normalizeCode(code)),
    expiresAtMs: nowMs + ENROLMENT_CODE_TTL_MS,
  };
}

/** Upper-cases and strips separators, so the code can be typed with or without dashes. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** A new device secret: 256 random bits, base64url. Returned once at enrolment. */
function newDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Issues a code for the owner to enter in the app. Its hash is stored; the code itself is not. */
export async function issueEnrolmentCode(store: DeviceStore, nowMs: number): Promise<string> {
  const enrolment = newEnrolmentCode(nowMs);
  await store.addEnrolmentCode(enrolment.codeSha256, enrolment.expiresAtMs);
  return enrolment.code;
}

export interface EnrolmentResult {
  readonly deviceId: string;
  readonly deviceSecret: string;
}

/**
 * Redeems a code and registers the device. Returns null for any refusal, and the reason is never disclosed to the
 * caller: an unknown, used or expired code all look the same from outside.
 */
export async function redeemEnrolment(
  store: DeviceStore,
  code: string,
  label: string,
  nowMs: number,
): Promise<EnrolmentResult | null> {
  if (!LABEL_PATTERN.test(label)) {
    return null;
  }
  const deviceId = randomUUID();
  const deviceSecret = newDeviceSecret();
  const ok = await store.redeemEnrolmentCode(sha256Hex(normalizeCode(code)), nowMs, {
    deviceId,
    label,
    secretSha256: sha256Hex(deviceSecret),
  });
  return ok ? { deviceId, deviceSecret } : null;
}

/**
 * Authenticates `Bearer <deviceId>.<secret>`. The secret is compared as a hash in constant time. Unknown, malformed
 * and revoked devices all produce null, and the same work is done for each so timing reveals nothing useful.
 */
export async function authenticateDevice(
  header: string | undefined,
  store: DeviceStore,
): Promise<string | null> {
  const match = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,256})$/.exec(header ?? "");
  const deviceId = match?.[1];
  const secret = match?.[2];
  const device = deviceId === undefined ? undefined : await store.findDevice(deviceId);
  const expected = Buffer.from(device?.secretSha256 ?? "0".repeat(64), "hex");
  const presented = Buffer.from(sha256Hex(secret ?? ""), "hex");
  const equal = timingSafeEqual(presented, expected);
  if (device === undefined || device.revoked || secret === undefined || !equal) {
    return null;
  }
  return device.deviceId;
}

/** In-memory store for unit tests and mock mode. One process only. */
export class InMemoryDeviceStore implements DeviceStore {
  private readonly codes = new Map<string, { expiresAtMs: number; used: boolean }>();
  private readonly devices = new Map<
    string,
    { label: string; secretSha256: string; revoked: boolean }
  >();

  async addEnrolmentCode(codeSha256: string, expiresAtMs: number): Promise<void> {
    this.codes.set(codeSha256, { expiresAtMs, used: false });
    await Promise.resolve();
  }

  async redeemEnrolmentCode(
    codeSha256: string,
    nowMs: number,
    device: { deviceId: string; label: string; secretSha256: string },
  ): Promise<boolean> {
    await Promise.resolve();
    const code = this.codes.get(codeSha256);
    if (code === undefined || code.used || code.expiresAtMs <= nowMs) {
      return false;
    }
    code.used = true;
    this.devices.set(device.deviceId, {
      label: device.label,
      secretSha256: device.secretSha256,
      revoked: false,
    });
    return true;
  }

  async findDevice(deviceId: string): Promise<DeviceRecord | undefined> {
    await Promise.resolve();
    const device = this.devices.get(deviceId);
    return device === undefined ? undefined : { deviceId, ...device };
  }

  async revokeDevice(deviceId: string): Promise<boolean> {
    await Promise.resolve();
    const device = this.devices.get(deviceId);
    if (device === undefined) {
      return false;
    }
    device.revoked = true;
    return true;
  }

  async listDevices(): Promise<DeviceSummary[]> {
    await Promise.resolve();
    return [...this.devices].map(([deviceId, device]) => ({
      deviceId,
      label: device.label,
      revoked: device.revoked,
    }));
  }

  /** Test helper: registers a device with a known secret, bypassing enrolment. */
  seedDevice(deviceId: string, secret: string, label = "test device"): void {
    this.devices.set(deviceId, { label, secretSha256: sha256Hex(secret), revoked: false });
  }
}

/** PostgreSQL store. The app role has SELECT, INSERT and UPDATE only; it cannot create or drop tables. */
export class PostgresDeviceStore implements DeviceStore {
  constructor(private readonly pool: Pool) {}

  async addEnrolmentCode(codeSha256: string, expiresAtMs: number): Promise<void> {
    await this.pool.query(
      "INSERT INTO broker_enrolment_code (code_sha256, expires_at) VALUES ($1, to_timestamp($2::double precision / 1000))",
      [codeSha256, expiresAtMs],
    );
  }

  async redeemEnrolmentCode(
    codeSha256: string,
    _nowMs: number,
    device: { deviceId: string; label: string; secretSha256: string },
  ): Promise<boolean> {
    // One database function marks the code used and registers the device in one transaction. Its clock is the
    // database clock. The application role has no direct INSERT on devices.
    const result = await this.pool.query<{ ok: boolean }>(
      "SELECT broker_redeem_enrolment($1, $2, $3, $4) AS ok",
      [codeSha256, device.deviceId, device.label, device.secretSha256],
    );
    return result.rows[0]?.ok === true;
  }

  async findDevice(deviceId: string): Promise<DeviceRecord | undefined> {
    const result = await this.pool.query<{
      device_id: string;
      label: string;
      secret_sha256: string;
      revoked: boolean;
    }>(
      "SELECT device_id, label, secret_sha256, revoked_at IS NOT NULL AS revoked FROM broker_device WHERE device_id = $1",
      [deviceId],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          deviceId: row.device_id,
          label: row.label,
          secretSha256: row.secret_sha256,
          revoked: row.revoked,
        };
  }

  async revokeDevice(deviceId: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE broker_device SET revoked_at = COALESCE(revoked_at, now()) WHERE device_id = $1",
      [deviceId],
    );
    return result.rowCount === 1;
  }

  async listDevices(): Promise<DeviceSummary[]> {
    const result = await this.pool.query<{ device_id: string; label: string; revoked: boolean }>(
      "SELECT device_id, label, revoked_at IS NOT NULL AS revoked FROM broker_device ORDER BY created_at",
    );
    return result.rows.map((row) => ({
      deviceId: row.device_id,
      label: row.label,
      revoked: row.revoked,
    }));
  }
}
