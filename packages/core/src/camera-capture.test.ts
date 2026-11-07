import { CameraCapture, CameraCaptureError } from "./camera-capture.js";
import type { CameraAdapter, CaptureResult, PlatformCheck } from "./camera-capture.js";
import { CaptureIndicator } from "./capture-indicator.js";

const T0 = 1_000;
const FRAME = new Uint8Array([1, 2, 3, 4]);
const yes: PlatformCheck = () => Promise.resolve(true);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise continuations run. */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function setup(
  overrides: {
    wearerIntent?: PlatformCheck;
    permission?: PlatformCheck;
    indicatorReady?: PlatformCheck;
    adapter?: CameraAdapter;
    indicator?: CaptureIndicator;
    maxFrameBytes?: number;
  } = {},
) {
  const indicator = overrides.indicator ?? new CaptureIndicator();
  const calls = { adapter: 0 };
  const adapter: CameraAdapter = overrides.adapter ?? {
    capture: () => {
      calls.adapter += 1;
      return Promise.resolve(FRAME);
    },
  };
  const camera = new CameraCapture({
    adapter,
    indicator,
    wearerIntent: overrides.wearerIntent ?? yes,
    permission: overrides.permission ?? yes,
    indicatorReady: overrides.indicatorReady ?? yes,
    maxFrameBytes: overrides.maxFrameBytes ?? 1024,
  });
  return { camera, indicator, calls };
}

describe("camera capture (C01)", () => {
  it("C01: capture needs exact-true permission", async () => {
    const { camera, calls } = setup({ permission: () => Promise.resolve("yes") });
    expect(await camera.capturePhoto(T0)).toEqual({ status: "REFUSED", reason: "NOT_PERMITTED" });
    expect(calls.adapter).toBe(0);
    const granted = setup();
    expect(await granted.camera.capturePhoto(T0)).toEqual({
      status: "OK",
      frame: FRAME,
      capturedAtMs: T0,
    });
  });

  it("C01: throwing or malformed permission fails closed", async () => {
    const throwing = setup({ permission: () => Promise.reject(new Error("service down")) });
    expect(await throwing.camera.capturePhoto(T0)).toEqual({
      status: "REFUSED",
      reason: "NOT_PERMITTED",
    });
    expect(throwing.calls.adapter).toBe(0);
    for (const value of [undefined, null, 1, "true", {}]) {
      const malformed = setup({ permission: () => Promise.resolve(value) });
      expect(await malformed.camera.capturePhoto(T0)).toEqual({
        status: "REFUSED",
        reason: "NOT_PERMITTED",
      });
      expect(malformed.calls.adapter).toBe(0);
    }
  });

  it("C01: indicator is on for the whole capture and off afterwards", async () => {
    const pending = deferred<Uint8Array>();
    const { camera, indicator } = setup({ adapter: { capture: () => pending.promise } });
    const running = camera.capturePhoto(T0);
    await flush();
    expect(indicator.isOn).toBe(true);
    pending.resolve(FRAME);
    expect((await running).status).toBe("OK");
    expect(indicator.isOn).toBe(false);
  });

  it("C01: concurrent capture is refused", async () => {
    const pending = deferred<Uint8Array>();
    const { camera, calls } = setup({ adapter: { capture: () => pending.promise } });
    const first = camera.capturePhoto(T0);
    await flush();
    expect(camera.capturing).toBe(true);
    expect(await camera.capturePhoto(T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    expect(calls.adapter).toBe(0);
    pending.resolve(FRAME);
    expect((await first).status).toBe("OK");
  });

  it("C01: adapter failure is reported and cleaned up", async () => {
    let fail = true;
    const adapter: CameraAdapter = {
      capture: () => (fail ? Promise.reject(new Error("driver fault")) : Promise.resolve(FRAME)),
    };
    const { camera, indicator } = setup({ adapter });
    expect(await camera.capturePhoto(T0)).toEqual({ status: "REFUSED", reason: "CAPTURE_FAILED" });
    expect(indicator.isOn).toBe(false);
    expect(camera.capturing).toBe(false);
    fail = false;
    expect((await camera.capturePhoto(T0 + 1)).status).toBe("OK");
  });

  it("C01: an empty or non-byte frame is a capture failure", async () => {
    const empty = setup({ adapter: { capture: () => Promise.resolve(new Uint8Array(0)) } });
    expect(await empty.camera.capturePhoto(T0)).toEqual({
      status: "REFUSED",
      reason: "CAPTURE_FAILED",
    });
    const wrongType = setup({
      adapter: { capture: () => Promise.resolve("not bytes" as unknown as Uint8Array) },
    });
    expect(await wrongType.camera.capturePhoto(T0)).toEqual({
      status: "REFUSED",
      reason: "CAPTURE_FAILED",
    });
  });

  it("C01: oversize frame is refused and discarded", async () => {
    const big = new Uint8Array(2048);
    const { camera } = setup({
      adapter: { capture: () => Promise.resolve(big) },
      maxFrameBytes: 1024,
    });
    const result = await camera.capturePhoto(T0);
    expect(result).toEqual({ status: "REFUSED", reason: "OVERSIZE" });
    expect(result).not.toHaveProperty("frame");
  });

  it("C01: cancel discards the frame", async () => {
    const pending = deferred<Uint8Array>();
    const { camera, indicator } = setup({ adapter: { capture: () => pending.promise } });
    const running = camera.capturePhoto(T0);
    await flush();
    camera.cancel();
    pending.resolve(FRAME);
    const result: CaptureResult = await running;
    expect(result).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(indicator.isOn).toBe(false);
    expect(camera.capturing).toBe(false);
  });

  it("C01: cancel with no capture in progress does nothing", async () => {
    const { camera } = setup();
    camera.cancel();
    expect((await camera.capturePhoto(T0)).status).toBe("OK");
  });

  it("C01: invalid time refused before any check or adapter call", async () => {
    let checked = false;
    const { camera, calls } = setup({
      wearerIntent: () => {
        checked = true;
        return Promise.resolve(true);
      },
    });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(await camera.capturePhoto(bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(checked).toBe(false);
    expect(calls.adapter).toBe(0);
  });

  it("C01: no frame is retained by the controller", async () => {
    const { camera } = setup();
    expect((await camera.capturePhoto(T0)).status).toBe("OK");
    expect(Object.keys(camera)).not.toContain("frame");
    expect(JSON.stringify(camera)).not.toContain("frame");
  });

  it("C01: invalid configuration is refused", () => {
    const indicator = new CaptureIndicator();
    const adapter: CameraAdapter = { capture: () => Promise.resolve(FRAME) };
    for (const maxFrameBytes of [0, -1, 1.5, 16 * 1024 * 1024 + 1]) {
      expect(
        () =>
          new CameraCapture({
            adapter,
            indicator,
            wearerIntent: yes,
            permission: yes,
            indicatorReady: yes,
            maxFrameBytes,
          }),
      ).toThrow(CameraCaptureError);
    }
  });

  it("C01 CR-42: capture needs verified wearer intent; missing, false, malformed or throwing refuse with no camera call", async () => {
    for (const intent of [
      () => Promise.resolve(false),
      () => Promise.resolve("yes"),
      () => Promise.resolve(undefined),
      () => Promise.reject(new Error("intent service down")),
    ]) {
      const { camera, calls, indicator } = setup({ wearerIntent: intent });
      expect(await camera.capturePhoto(T0)).toEqual({
        status: "REFUSED",
        reason: "NO_WEARER_INTENT",
      });
      expect(calls.adapter).toBe(0);
      expect(indicator.isOn).toBe(false);
    }
  });

  it("C01 CR-42: capture needs physical indicator readiness; unconfirmed refuses and closes the session", async () => {
    for (const ready of [
      () => Promise.resolve(false),
      () => Promise.resolve(1),
      () => Promise.reject(new Error("indicator unreachable")),
    ]) {
      const { camera, calls, indicator } = setup({ indicatorReady: ready });
      expect(await camera.capturePhoto(T0)).toEqual({
        status: "REFUSED",
        reason: "INDICATOR_UNCONFIRMED",
      });
      expect(calls.adapter).toBe(0);
      expect(indicator.isOn).toBe(false);
      expect(camera.capturing).toBe(false);
    }
  });

  it("C01 CR-43: cancel during a pending permission check returns CANCELLED with no camera call and no indicator", async () => {
    const permission = deferred<unknown>();
    const { camera, calls, indicator } = setup({ permission: () => permission.promise });
    const running = camera.capturePhoto(T0);
    await flush();
    expect(camera.capturing).toBe(true);
    camera.cancel();
    permission.resolve(true);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(calls.adapter).toBe(0);
    expect(indicator.isOn).toBe(false);
    expect(camera.capturing).toBe(false);
  });

  it("C01 CR-43: cancel during a pending wearer-intent check is honoured", async () => {
    const intent = deferred<unknown>();
    const { camera, calls } = setup({ wearerIntent: () => intent.promise });
    const running = camera.capturePhoto(T0);
    await flush();
    camera.cancel();
    intent.resolve(true);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(calls.adapter).toBe(0);
  });

  it("C01 CR-43: cancel during a pending indicator check stops before the camera", async () => {
    const ready = deferred<unknown>();
    const { camera, calls, indicator } = setup({ indicatorReady: () => ready.promise });
    const running = camera.capturePhoto(T0);
    await flush();
    expect(indicator.isOn).toBe(true);
    camera.cancel();
    ready.resolve(true);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(calls.adapter).toBe(0);
    expect(indicator.isOn).toBe(false);
  });

  it("C01 shared indicator: one controller finishing does not switch off the indicator while another still captures", async () => {
    const indicator = new CaptureIndicator();
    const pendingA = deferred<Uint8Array>();
    const pendingB = deferred<Uint8Array>();
    const a = setup({ indicator, adapter: { capture: () => pendingA.promise } });
    const b = setup({ indicator, adapter: { capture: () => pendingB.promise } });
    const runA = a.camera.capturePhoto(T0);
    const runB = b.camera.capturePhoto(T0);
    await flush();
    expect(indicator.isOn).toBe(true);
    pendingA.resolve(FRAME);
    expect((await runA).status).toBe("OK");
    expect(indicator.isOn).toBe(true);
    pendingB.resolve(FRAME);
    expect((await runB).status).toBe("OK");
    expect(indicator.isOn).toBe(false);
  });
});
