import { OfflineCommandRouter, normalizeUtterance } from "./offline-command-router.js";
import type { CommandSource } from "./offline-command-router.js";
import type { CommandHandler, LocalCommand } from "./offline-command-router.js";

const COMMANDS: LocalCommand[] = [
  { id: "CLOCK", phrases: ["what time is it", "time"], sensitivity: "SAFE" },
  { id: "BATTERY", phrases: ["battery level"], sensitivity: "SAFE" },
  { id: "LOCK_DEVICE", phrases: ["lock the glasses"], sensitivity: "SENSITIVE" },
  {
    id: "CAPTURE_PHOTO",
    phrases: ["take a photo"],
    sensitivity: "SAFE",
    allowConcurrent: true,
  },
];

const NOT_AUTHORIZED: CommandSource = "EXTERNAL";
const AUTHORIZED: CommandSource = "OWNER";

function handlersFor(
  overrides: Record<string, CommandHandler> = {},
): Record<string, CommandHandler> {
  const ok: CommandHandler = () => Promise.resolve();
  return { CLOCK: ok, BATTERY: ok, LOCK_DEVICE: ok, CAPTURE_PHOTO: ok, ...overrides };
}

describe("normalizeUtterance", () => {
  it("lowercases, strips punctuation, collapses spaces and removes a leading wake word", () => {
    expect(normalizeUtterance("  Hey LensMate, what   time is it?! ")).toBe("what time is it");
    expect(normalizeUtterance("LensMate battery level")).toBe("battery level");
    expect(normalizeUtterance("lensmate")).toBe("");
  });
});

describe("OfflineCommandRouter.route", () => {
  const router = new OfflineCommandRouter(COMMANDS);

  it("routes a recognized phrase to its command without any network or phone input", () => {
    expect(router.route("what time is it", NOT_AUTHORIZED)).toEqual({
      kind: "EXECUTE",
      commandId: "CLOCK",
    });
    expect(router.route("Hey LensMate, Time", NOT_AUTHORIZED)).toEqual({
      kind: "EXECUTE",
      commandId: "CLOCK",
    });
  });

  it("returns UNKNOWN for an unsupported command instead of guessing", () => {
    expect(router.route("book a flight to paris", NOT_AUTHORIZED)).toEqual({
      kind: "UNKNOWN",
      reason: "NO_MATCH",
    });
  });

  it("returns UNKNOWN for empty or wake-word-only input", () => {
    expect(router.route("   ", NOT_AUTHORIZED)).toEqual({ kind: "UNKNOWN", reason: "EMPTY_INPUT" });
    expect(router.route("Hey LensMate", NOT_AUTHORIZED)).toEqual({
      kind: "UNKNOWN",
      reason: "EMPTY_INPUT",
    });
  });

  it("requires authorization for sensitive commands", () => {
    expect(router.route("lock the glasses", NOT_AUTHORIZED)).toEqual({
      kind: "NEEDS_AUTHORIZATION",
      commandId: "LOCK_DEVICE",
    });
    const ownerOnly = new OfflineCommandRouter(COMMANDS, {
      authorize: (_commandId, source) => source === "OWNER",
    });
    expect(ownerOnly.route("lock the glasses", AUTHORIZED)).toEqual({
      kind: "EXECUTE",
      commandId: "LOCK_DEVICE",
    });
    expect(ownerOnly.route("lock the glasses", NOT_AUTHORIZED)).toEqual({
      kind: "NEEDS_AUTHORIZATION",
      commandId: "LOCK_DEVICE",
    });
  });

  it("denies sensitive commands by default when no policy is supplied", () => {
    expect(router.route("lock the glasses", AUTHORIZED)).toEqual({
      kind: "NEEDS_AUTHORIZATION",
      commandId: "LOCK_DEVICE",
    });
  });

  it("asks the trusted policy with the command id and source, so a caller cannot grant itself access", () => {
    const seen: Array<[string, CommandSource]> = [];
    const policy = new OfflineCommandRouter(COMMANDS, {
      authorize: (commandId, source) => {
        seen.push([commandId, source]);
        return false;
      },
    });
    expect(policy.route("lock the glasses", "OWNER")).toEqual({
      kind: "NEEDS_AUTHORIZATION",
      commandId: "LOCK_DEVICE",
    });
    expect(seen).toEqual([["LOCK_DEVICE", "OWNER"]]);
  });

  it("does not consult the policy for SAFE commands", () => {
    const policy = jest.fn<boolean, [string, CommandSource]>(() => false);
    const safeRouter = new OfflineCommandRouter(COMMANDS, { authorize: policy });
    expect(safeRouter.route("time", NOT_AUTHORIZED)).toEqual({
      kind: "EXECUTE",
      commandId: "CLOCK",
    });
    expect(policy).not.toHaveBeenCalled();
  });

  it("rejects construction with a phrase claimed by two commands", () => {
    expect(
      () =>
        new OfflineCommandRouter([
          { id: "A", phrases: ["go"], sensitivity: "SAFE" },
          { id: "B", phrases: ["Go!"], sensitivity: "SAFE" },
        ]),
    ).toThrow(/claimed by more than one command/);
  });

  it("rejects duplicate command ids and empty phrases", () => {
    expect(
      () =>
        new OfflineCommandRouter([
          { id: "A", phrases: ["one"], sensitivity: "SAFE" },
          { id: "A", phrases: ["two"], sensitivity: "SAFE" },
        ]),
    ).toThrow(/duplicate command id/);
    expect(
      () => new OfflineCommandRouter([{ id: "A", phrases: ["!!!"], sensitivity: "SAFE" }]),
    ).toThrow(/empty phrase/);
  });
});

describe("OfflineCommandRouter.execute", () => {
  it("runs a matched command offline when fetch is unavailable", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const originalFetch = globalThis.fetch;
    // Simulate no internet: any network use fails the test.
    globalThis.fetch = () => {
      throw new Error("network must not be used");
    };
    try {
      const run = jest.fn<Promise<void>, [AbortSignal]>().mockResolvedValue(undefined);
      const result = await router.execute(
        "battery level",
        NOT_AUTHORIZED,
        handlersFor({ BATTERY: run }),
      );
      expect(result).toEqual({ status: "COMPLETED", commandId: "BATTERY" });
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not run a sensitive command without authorization", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const run = jest.fn<Promise<void>, [AbortSignal]>().mockResolvedValue(undefined);
    const result = await router.execute(
      "lock the glasses",
      NOT_AUTHORIZED,
      handlersFor({ LOCK_DEVICE: run }),
    );
    expect(result).toEqual({ status: "NEEDS_AUTHORIZATION", commandId: "LOCK_DEVICE" });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns UNKNOWN without calling any handler for an unsupported command", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const run = jest.fn<Promise<void>, [AbortSignal]>().mockResolvedValue(undefined);
    const result = await router.execute("sing a song", NOT_AUTHORIZED, handlersFor({ CLOCK: run }));
    expect(result).toEqual({ status: "UNKNOWN", reason: "NO_MATCH" });
    expect(run).not.toHaveBeenCalled();
  });

  it("reports a handler error as FAILED without throwing and clears the running slot", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const failing: CommandHandler = () => Promise.reject(new Error("sensor offline"));
    const result = await router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: failing }));
    expect(result).toEqual({ status: "FAILED", commandId: "CLOCK", reason: "HANDLER_ERROR" });
    expect(router.runningCount).toBe(0);
  });

  it("refuses a duplicate run of a non-concurrent command while the first is in flight", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    let release: () => void = () => undefined;
    const slow: CommandHandler = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const first = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: slow }));
    const second = await router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: slow }));
    expect(second).toEqual({ status: "SKIPPED_DUPLICATE", commandId: "CLOCK" });
    release();
    expect(await first).toEqual({ status: "COMPLETED", commandId: "CLOCK" });
  });

  it("allows concurrent runs when the command is declared concurrent-safe", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const releases: Array<() => void> = [];
    const slow: CommandHandler = () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      });
    const a = router.execute("take a photo", NOT_AUTHORIZED, handlersFor({ CAPTURE_PHOTO: slow }));
    const b = router.execute("take a photo", NOT_AUTHORIZED, handlersFor({ CAPTURE_PHOTO: slow }));
    expect(router.runningCount).toBe(2);
    releases.forEach((release) => {
      release();
    });
    expect(await a).toEqual({ status: "COMPLETED", commandId: "CAPTURE_PHOTO" });
    expect(await b).toEqual({ status: "COMPLETED", commandId: "CAPTURE_PHOTO" });
  });

  it("cancel aborts a running command and reports CANCELLED", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    let observed: AbortSignal | undefined;
    const waitForAbort: CommandHandler = (signal) => {
      observed = signal;
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    };
    const pending = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: waitForAbort }));
    expect(router.cancel("CLOCK")).toBe(true);
    expect(observed?.aborted).toBe(true);
    expect(await pending).toEqual({ status: "CANCELLED", commandId: "CLOCK" });
    await flush();
    expect(router.runningCount).toBe(0);
  });

  it("cancel returns false when nothing is running for that id", () => {
    const router = new OfflineCommandRouter(COMMANDS);
    expect(router.cancel("CLOCK")).toBe(false);
  });

  it("cancelAll stops every running command and allows a clean restart", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const waitForAbort: CommandHandler = (signal) =>
      new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    const pending = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: waitForAbort }));
    router.cancelAll();
    expect(await pending).toEqual({ status: "CANCELLED", commandId: "CLOCK" });
    await flush();
    expect(router.runningCount).toBe(0);
    const next = await router.execute("time", NOT_AUTHORIZED, handlersFor());
    expect(next).toEqual({ status: "COMPLETED", commandId: "CLOCK" });
  });
});

/** A handler that ignores its abort signal and only settles when the test releases it. */
function stubbornHandler(): { handler: CommandHandler; release: () => void; calls: () => number } {
  let calls = 0;
  let release: () => void = () => undefined;
  const handler: CommandHandler = () => {
    calls += 1;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  return {
    handler,
    release: () => {
      release();
    },
    calls: () => calls,
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("OfflineCommandRouter cancellation lifecycle (CR-06)", () => {
  it("keeps a non-concurrent command occupied while a cancelled handler ignores the abort", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const stubborn = stubbornHandler();
    const first = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: stubborn.handler }));
    expect(router.cancel("CLOCK")).toBe(true);
    expect(await first).toEqual({ status: "CANCELLED", commandId: "CLOCK" });

    // The old handler is still running, so a restart must be refused.
    expect(router.runningCount).toBe(1);
    const restart = await router.execute(
      "time",
      NOT_AUTHORIZED,
      handlersFor({ CLOCK: stubborn.handler }),
    );
    expect(restart).toEqual({ status: "SKIPPED_DUPLICATE", commandId: "CLOCK" });
    expect(stubborn.calls()).toBe(1);

    stubborn.release();
    await flush();
    expect(router.runningCount).toBe(0);
    const after = await router.execute("time", NOT_AUTHORIZED, handlersFor());
    expect(after).toEqual({ status: "COMPLETED", commandId: "CLOCK" });
  });

  it("cancelAll with an ignored abort keeps the slot until the handler settles", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const stubborn = stubbornHandler();
    const first = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: stubborn.handler }));
    router.cancelAll();
    expect(await first).toEqual({ status: "CANCELLED", commandId: "CLOCK" });
    expect(router.runningCount).toBe(1);
    expect(await router.execute("time", NOT_AUTHORIZED, handlersFor())).toEqual({
      status: "SKIPPED_DUPLICATE",
      commandId: "CLOCK",
    });
    stubborn.release();
    await flush();
    expect(router.runningCount).toBe(0);
  });

  it("cancel-and-restart race: a restart issued right after cancel is refused", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const stubborn = stubbornHandler();
    const first = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: stubborn.handler }));
    router.cancel("CLOCK");
    const racing = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: stubborn.handler }));
    expect(await racing).toEqual({ status: "SKIPPED_DUPLICATE", commandId: "CLOCK" });
    expect(stubborn.calls()).toBe(1);
    expect(await first).toEqual({ status: "CANCELLED", commandId: "CLOCK" });
    stubborn.release();
    await flush();
    expect(router.runningCount).toBe(0);
  });

  it("delayed cancellation: a handler that finishes after the abort reports CANCELLED, then frees the slot", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const delayed: CommandHandler = (signal) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(signal.aborted).toBe(true);
          resolve();
        }, 5);
      });
    const first = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: delayed }));
    router.cancel("CLOCK");
    expect(await first).toEqual({ status: "CANCELLED", commandId: "CLOCK" });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(router.runningCount).toBe(0);
  });

  it("cleans up after a failure so the next run is not refused", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const failing: CommandHandler = () => Promise.reject(new Error("boom"));
    expect(await router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: failing }))).toEqual({
      status: "FAILED",
      commandId: "CLOCK",
      reason: "HANDLER_ERROR",
    });
    await flush();
    expect(router.runningCount).toBe(0);
    expect(await router.execute("time", NOT_AUTHORIZED, handlersFor())).toEqual({
      status: "COMPLETED",
      commandId: "CLOCK",
    });
  });

  it("a stubborn handler on one command does not block a different command", async () => {
    const router = new OfflineCommandRouter(COMMANDS);
    const stubborn = stubbornHandler();
    const first = router.execute("time", NOT_AUTHORIZED, handlersFor({ CLOCK: stubborn.handler }));
    router.cancel("CLOCK");
    await first;
    expect(await router.execute("battery level", NOT_AUTHORIZED, handlersFor())).toEqual({
      status: "COMPLETED",
      commandId: "BATTERY",
    });
    stubborn.release();
    await flush();
  });
});
