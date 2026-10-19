import type { ProviderRun } from "./provider-gateway.js";

export type MockAction = "ok" | "fail" | "hang";

/**
 * Mock provider for tests and the simulator. It never calls a real provider and never holds a key
 * (v9 section 14; Goal 9). Each attempt takes the next scripted action; the last action repeats.
 * "hang" waits until the caller aborts, which models a stalled provider.
 */
export interface MockProvider<T> {
  readonly run: ProviderRun<T>;
  readonly attempts: () => number;
}

export function createMockProvider<T>(
  script: readonly MockAction[],
  value: T,
  costMinor: number,
): MockProvider<T> {
  if (script.length === 0) {
    throw new RangeError("mock provider needs at least one scripted action");
  }
  let attempts = 0;
  const run: ProviderRun<T> = (signal) => {
    const action = script[Math.min(attempts, script.length - 1)] ?? "fail";
    attempts += 1;
    if (action === "ok") {
      return Promise.resolve({ value, costMinor });
    }
    if (action === "fail") {
      return Promise.reject(new Error("mock provider failed"));
    }
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(new Error("mock provider aborted"));
      });
    });
  };
  return { run, attempts: () => attempts };
}
