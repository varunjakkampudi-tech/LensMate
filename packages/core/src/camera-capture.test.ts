import { CameraCapture, CameraCaptureError } from "./camera-capture.js";
import type { CameraAdapter, CaptureResult } from "./camera-capture.js";
import { CaptureIndicator } from "./capture-indicator.js";

const T0 = 1_000;
const FRAME = new Uint8Array([1, 2, 3, 4]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  overrides: {
    permission?: () => Promise<unknown>;
    adapter?: CameraAdapter;
    maxFrameBytes?: number;
  } = {},
) {
  const indicator = new CaptureIndicator();
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
    permission: overrides.permission ?? (() => Promise.resolve(true)),
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
    const result = await granted.camera.capturePhoto(T0);
    expect(result).toEqual({ status: "OK", frame: FRAME, capturedAtMs: T0 });
  });

  it("C01: throwing or malformed permission fails closed", async () => {
    const throwing = setup({
      permission: () => Promise.reject(new Error("permission service down")),
    });
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
    const adapter: CameraAdapter = { capture: () => pending.promise };
    const { camera, indicator } = setup({ adapter });
    const running = camera.capturePhoto(T0);
    await Promise.resolve();
    await Promise.resolve();
    expect(indicator.isOn).toBe(true);
    pending.resolve(FRAME);
    expect((await running).status).toBe("OK");
    expect(indicator.isOn).toBe(false);
  });

  it("C01: concurrent capture is refused", async () => {
    const pending = deferred<Uint8Array>();
    const adapter: CameraAdapter = { capture: () => pending.promise };
    const { camera, calls } = setup({ adapter });
    const first = camera.capturePhoto(T0);
    await Promise.resolve();
    await Promise.resolve();
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
    const adapter: CameraAdapter = { capture: () => pending.promise };
    const { camera, indicator } = setup({ adapter });
    const running = camera.capturePhoto(T0);
    await Promise.resolve();
    await Promise.resolve();
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

  it("C01: invalid time refused before any permission check or adapter call", async () => {
    let permissionAsked = false;
    const { camera, calls } = setup({
      permission: () => {
        permissionAsked = true;
        return Promise.resolve(true);
      },
    });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(await camera.capturePhoto(bad)).toEqual({ status: "REFUSED", reason: "BAD_INPUT" });
    }
    expect(permissionAsked).toBe(false);
    expect(calls.adapter).toBe(0);
  });

  it("C01: no frame is retained by the controller", async () => {
    const { camera } = setup();
    const result = await camera.capturePhoto(T0);
    expect(result.status).toBe("OK");
    expect(Object.keys(camera)).not.toContain("frame");
    expect(JSON.stringify(camera)).not.toContain("frame");
  });

  it("C01: invalid configuration is refused", () => {
    const indicator = new CaptureIndicator();
    const adapter: CameraAdapter = { capture: () => Promise.resolve(FRAME) };
    const permission = () => Promise.resolve(true);
    for (const maxFrameBytes of [0, -1, 1.5, 16 * 1024 * 1024 + 1]) {
      expect(() => new CameraCapture({ adapter, indicator, permission, maxFrameBytes })).toThrow(
        CameraCaptureError,
      );
    }
  });
});
