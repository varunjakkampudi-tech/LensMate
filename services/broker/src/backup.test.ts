import { InMemoryBudgetStore } from "./budget.js";
import { InMemoryBackupStore, MAX_BACKUP_CHARS } from "./backup.js";
import { InMemoryDeviceStore } from "./devices.js";
import { MockProvider } from "./provider.js";
import { buildServer } from "./server.js";
import { TEST_AUTH_HEADER, TEST_CLIENT_SECRET, TEST_DEVICE_ID, testConfig } from "./test-config.js";

const DAY = 86_400_000;

async function setup(clock: { now: number }) {
  const devices = new InMemoryDeviceStore();
  devices.seedDevice(TEST_DEVICE_ID, TEST_CLIENT_SECRET);
  const backups = new InMemoryBackupStore();
  const app = await buildServer({
    config: testConfig(),
    budget: new InMemoryBudgetStore(),
    devices,
    backups,
    provider: new MockProvider(),
    now: () => clock.now,
    logger: { level: "silent", redact: { paths: [], censor: "" } },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const base = app.listeningOrigin;
  const call = async (method: string, body?: unknown, auth: boolean | string = true) => {
    const res = await fetch(`${base}/v1/backup`, {
      method,
      headers: {
        ...(auth === false ? {} : { authorization: auth === true ? TEST_AUTH_HEADER : auth }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { statusCode: res.status, json: () => JSON.parse(text) as unknown };
  };
  opened.push(app);
  return { call, backups, devices, base };
}

const opened: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((a) => a.close()));
});

describe("encrypted memory backup", () => {
  it("refuses callers without a device credential", async () => {
    const { call } = await setup({ now: 1_000 });
    expect((await call("GET", undefined, false)).statusCode).toBe(401);
    expect((await call("PUT", { ciphertext: "abc", retentionDays: 7 }, false)).statusCode).toBe(
      401,
    );
  });

  it("stores, returns and deletes one opaque ciphertext per device", async () => {
    const { call } = await setup({ now: 1_000 });
    const saved = await call("PUT", { ciphertext: "v1.c2FsdA.aXY.Y2lwaGVy", retentionDays: 30 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ updatedAt: 1_000, expiresAt: 1_000 + 30 * DAY });
    expect((await call("GET")).json()).toMatchObject({ ciphertext: "v1.c2FsdA.aXY.Y2lwaGVy" });
    expect((await call("DELETE")).statusCode).toBe(204);
    expect((await call("GET")).statusCode).toBe(404);
  });

  it("forgets a backup once its retention period has passed", async () => {
    const clock = { now: 1_000 };
    const { call } = await setup(clock);
    await call("PUT", { ciphertext: "abc", retentionDays: 1 });
    clock.now += DAY;
    expect((await call("GET")).statusCode).toBe(404);
  });

  it("purges expired backups without any device asking", async () => {
    const store = new InMemoryBackupStore();
    await store.put("a", "x", 0, 10);
    await store.put("b", "y", 0, 1_000);
    expect(await store.purgeExpired(10)).toBe(1);
    expect(await store.get("b", 10)).not.toBeNull();
  });

  it("rejects out-of-range retention, oversized and non-base64 bodies", async () => {
    const { call } = await setup({ now: 1_000 });
    expect((await call("PUT", { ciphertext: "abc", retentionDays: 0 })).statusCode).toBe(400);
    expect((await call("PUT", { ciphertext: "abc", retentionDays: 366 })).statusCode).toBe(400);
    expect(
      (await call("PUT", { ciphertext: "a".repeat(MAX_BACKUP_CHARS + 1), retentionDays: 7 }))
        .statusCode,
    ).toBe(400);
    expect((await call("PUT", { ciphertext: "<script>", retentionDays: 7 })).statusCode).toBe(400);
  });

  it("a revoked device can neither read, replace nor delete its backup", async () => {
    const { call, devices } = await setup({ now: 1_000 });
    expect(
      (await call("PUT", { ciphertext: "v1.c2FsdA.aXY.Y2lwaGVy", retentionDays: 30 })).statusCode,
    ).toBe(200);
    await devices.revokeDevice(TEST_DEVICE_ID);
    expect((await call("GET")).statusCode).toBe(401);
    expect(
      (await call("PUT", { ciphertext: "v1.c2FsdA.aXY.Y2lwaGVy", retentionDays: 30 })).statusCode,
    ).toBe(401);
    expect((await call("DELETE")).statusCode).toBe(401);
  });

  it("a newly enrolled device cannot see the backup of the device it replaces", async () => {
    const { call, devices } = await setup({ now: 1_000 });
    devices.seedDevice(
      "22222222-2222-4222-8222-222222222222",
      "replacement-device-secret-".repeat(2),
    );
    expect(
      (await call("PUT", { ciphertext: "v1.c2FsdA.aXY.Y2lwaGVy", retentionDays: 30 })).statusCode,
    ).toBe(200);
    await devices.revokeDevice(TEST_DEVICE_ID);
    const replacement =
      "Bearer 22222222-2222-4222-8222-222222222222.replacement-device-secret-replacement-device-secret-";
    expect((await call("GET", undefined, replacement)).statusCode).toBe(404);
  });
});
