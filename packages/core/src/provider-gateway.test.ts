import { ProviderGateway } from "./provider-gateway.js";
import type { GatewayOptions } from "./provider-gateway.js";
import { SpendCap } from "./spend-cap.js";
import { createMockProvider } from "./mock-provider.js";
import type { MockAction } from "./mock-provider.js";

const BASE_OPTIONS: GatewayOptions = {
  timeoutMs: 50,
  maxAttempts: 2,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 1000,
  now: () => 0,
};

function gateway(
  cap = new SpendCap(500),
  overrides: Partial<GatewayOptions> = {},
): { gateway: ProviderGateway; cap: SpendCap } {
  const options = { ...BASE_OPTIONS, ...overrides };
  const g = new ProviderGateway(cap, options);
  g.acceptDisclosure("assistant");
  return { gateway: g, cap };
}

function provider(script: readonly MockAction[], cost = 100) {
  return createMockProvider(script, "SYNTHETIC-RESPONSE", cost);
}

describe("ProviderGateway", () => {
  it("refuses a feature whose cloud disclosure was not accepted, and makes no provider call", async () => {
    const { gateway: g } = gateway();
    const p = provider(["ok"]);
    const result = await g.call("photo-question", 10, p.run);
    expect(result).toEqual({ ok: false, errorCode: "DISCLOSURE_REQUIRED" });
    expect(p.attempts()).toBe(0);
  });

  it("returns the value and records the actual cost on success", async () => {
    const cap = new SpendCap(500);
    const { gateway: g } = gateway(cap);
    const result = await g.call("assistant", 100, provider(["ok"], 120).run);
    expect(result).toEqual({ ok: true, value: "SYNTHETIC-RESPONSE", costMinor: 120 });
    expect(cap.spent).toBe(120);
  });

  it("stops the call before the provider when the spend cap would be exceeded (checklist 19)", async () => {
    const cap = new SpendCap(500, 450);
    const { gateway: g } = gateway(cap);
    const p = provider(["ok"]);
    expect(await g.call("assistant", 100, p.run)).toEqual({
      ok: false,
      errorCode: "CAP_REACHED",
    });
    expect(p.attempts()).toBe(0);
    expect(cap.spent).toBe(450);
  });

  it("refuses an invalid estimated amount before the provider call", async () => {
    const { gateway: g } = gateway();
    const p = provider(["ok"]);
    expect(await g.call("assistant", -5, p.run)).toEqual({
      ok: false,
      errorCode: "INVALID_AMOUNT",
    });
    expect(p.attempts()).toBe(0);
  });

  it("retries a provider error once and succeeds on the second attempt", async () => {
    const { gateway: g } = gateway();
    const p = provider(["fail", "ok"]);
    const result = await g.call("assistant", 100, p.run);
    expect(result.ok).toBe(true);
    expect(p.attempts()).toBe(2);
  });

  it("reports a provider error when every attempt fails", async () => {
    const { gateway: g } = gateway();
    const p = provider(["fail", "fail"]);
    expect(await g.call("assistant", 100, p.run)).toEqual({
      ok: false,
      errorCode: "PROVIDER_ERROR",
    });
    expect(p.attempts()).toBe(2);
  });

  it("times out a stalled attempt and does not retry a timeout", async () => {
    const { gateway: g } = gateway();
    const p = provider(["hang", "ok"]);
    expect(await g.call("assistant", 100, p.run)).toEqual({ ok: false, errorCode: "TIMEOUT" });
    expect(p.attempts()).toBe(1);
  });

  it("checks the spend cap again before a retry", async () => {
    const cap = new SpendCap(150);
    const { gateway: g } = gateway(cap, { maxAttempts: 3 });
    const p = provider(["fail", "ok"], 100);
    // First attempt fails and records nothing. The retry is still under the cap, so it succeeds.
    expect((await g.call("assistant", 100, p.run)).ok).toBe(true);
    expect(cap.spent).toBe(100);
    // A second call of the same estimate would exceed the cap and is refused without a provider call.
    const q = provider(["ok"], 100);
    expect(await g.call("assistant", 100, q.run)).toEqual({
      ok: false,
      errorCode: "CAP_REACHED",
    });
    expect(q.attempts()).toBe(0);
  });

  it("opens the circuit after repeated failures and closes it after the cooldown", async () => {
    let clock = 0;
    const { gateway: g } = gateway(new SpendCap(10_000), {
      maxAttempts: 1,
      circuitFailureThreshold: 2,
      circuitCooldownMs: 1000,
      now: () => clock,
    });
    const failing = provider(["fail"]);
    expect(await g.call("assistant", 10, failing.run)).toEqual({
      ok: false,
      errorCode: "PROVIDER_ERROR",
    });
    expect(await g.call("assistant", 10, failing.run)).toEqual({
      ok: false,
      errorCode: "PROVIDER_ERROR",
    });

    const blocked = provider(["ok"]);
    expect(await g.call("assistant", 10, blocked.run)).toEqual({
      ok: false,
      errorCode: "CIRCUIT_OPEN",
    });
    expect(blocked.attempts()).toBe(0);

    clock = 1000;
    expect((await g.call("assistant", 10, blocked.run)).ok).toBe(true);
  });

  it("resets the failure count after a success", async () => {
    const { gateway: g } = gateway(new SpendCap(10_000), {
      maxAttempts: 1,
      circuitFailureThreshold: 2,
    });
    await g.call("assistant", 10, provider(["fail"]).run);
    expect((await g.call("assistant", 10, provider(["ok"]).run)).ok).toBe(true);
    await g.call("assistant", 10, provider(["fail"]).run);
    expect((await g.call("assistant", 10, provider(["ok"]).run)).ok).toBe(true);
  });

  it("stops retrying once the circuit opens during the call", async () => {
    const { gateway: g } = gateway(new SpendCap(10_000), {
      maxAttempts: 3,
      circuitFailureThreshold: 1,
    });
    const p = provider(["fail", "ok"]);
    expect(await g.call("assistant", 10, p.run)).toEqual({
      ok: false,
      errorCode: "PROVIDER_ERROR",
    });
    expect(p.attempts()).toBe(1);
  });

  it("treats a non-Error rejection from the provider as a provider error", async () => {
    const { gateway: g } = gateway(new SpendCap(10_000), { maxAttempts: 1 });
    // A provider may reject with a plain value. The gateway still reports it as a provider error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const run = () => Promise.reject("plain-value");
    expect(await g.call("assistant", 10, run)).toEqual({
      ok: false,
      errorCode: "PROVIDER_ERROR",
    });
  });
});
