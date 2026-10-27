import { manipulateAsync } from "expo-image-manipulator";
import { createCaptureGate, toJpegDataUrl, type CaptureGateDeps } from "./camera.native";

jest.mock("expo-camera", () => ({ CameraView: () => null, useCameraPermissions: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({
    uri: "file:///out.jpg",
    base64: "QUJD",
    width: 1,
    height: 1,
  })),
  SaveFormat: { JPEG: "jpeg" },
}));

const photo = { uri: "file:///photo.jpg", width: 3024, height: 4032 };

function deps(overrides: Partial<CaptureGateDeps> = {}): CaptureGateDeps & { onError: jest.Mock } {
  return {
    ready: () => true,
    takePicture: jest.fn(async () => photo),
    encode: jest.fn(async () => "data:image/jpeg;base64,QUJD"),
    isMounted: () => true,
    onError: jest.fn(),
    ...overrides,
  } as CaptureGateDeps & { onError: jest.Mock };
}

describe("capture gate", () => {
  it("returns a JPEG data URL for a successful capture", async () => {
    const d = deps();
    const capture = createCaptureGate(d);

    await expect(capture()).resolves.toBe("data:image/jpeg;base64,QUJD");
    expect(d.takePicture).toHaveBeenCalledTimes(1);
    expect(d.onError).not.toHaveBeenCalled();
  });

  it("blocks a second capture while one is still running, without a second photo", async () => {
    let finish: (value: typeof photo) => void = () => undefined;
    const d = deps({ takePicture: jest.fn(() => new Promise<typeof photo>((r) => (finish = r))) });
    const capture = createCaptureGate(d);

    const first = capture();
    const second = await capture();
    finish(photo);
    const firstResult = await first;

    expect(second).toBeNull();
    expect(firstResult).toBe("data:image/jpeg;base64,QUJD");
    expect(d.takePicture).toHaveBeenCalledTimes(1);
  });

  it("allows a new capture after the previous one has finished", async () => {
    const d = deps();
    const capture = createCaptureGate(d);

    await capture();
    await expect(capture()).resolves.toBe("data:image/jpeg;base64,QUJD");
    expect(d.takePicture).toHaveBeenCalledTimes(2);
  });

  it("returns null without touching the camera when it is not ready", async () => {
    const d = deps({ ready: () => false });

    await expect(createCaptureGate(d)()).resolves.toBeNull();
    expect(d.takePicture).not.toHaveBeenCalled();
    expect(d.onError).not.toHaveBeenCalled();
  });

  it("reports a failed photo with a short message and returns null", async () => {
    const d = deps({
      takePicture: jest.fn(async () => {
        throw new Error("native camera error: device busy at /private/path");
      }),
    });

    await expect(createCaptureGate(d)()).resolves.toBeNull();
    expect(d.onError).toHaveBeenCalledWith(
      "The photo could not be taken. Try again, or upload a photo instead.",
    );
    expect(d.onError.mock.calls[0]?.[0]).not.toContain("/private/path");
  });

  it("reports a failed encode and returns null", async () => {
    const d = deps({
      encode: jest.fn(async () => {
        throw new Error("manipulator failed");
      }),
    });

    await expect(createCaptureGate(d)()).resolves.toBeNull();
    expect(d.onError).toHaveBeenCalledTimes(1);
  });

  it("discards the result, and reports nothing, when the screen unmounts mid-capture", async () => {
    let mounted = true;
    const d = deps({ isMounted: () => mounted });
    const capture = createCaptureGate(d);

    const pending = capture();
    mounted = false;

    await expect(pending).resolves.toBeNull();
    expect(d.onError).not.toHaveBeenCalled();
  });

  it("releases the guard after a failure, so the next attempt can run", async () => {
    let fail = true;
    const d = deps({
      takePicture: jest.fn(async () => {
        if (fail) {
          throw new Error("busy");
        }
        return photo;
      }),
    });
    const capture = createCaptureGate(d);

    await capture();
    fail = false;

    await expect(capture()).resolves.toBe("data:image/jpeg;base64,QUJD");
  });
});

describe("toJpegDataUrl", () => {
  it("resizes the long side to 1024 px and returns a JPEG data URL", async () => {
    const url = await toJpegDataUrl("file:///photo.jpg", 3024, 4032);

    expect(url).toBe("data:image/jpeg;base64,QUJD");
    const actions = (manipulateAsync as jest.Mock).mock.calls.at(-1)?.[1];
    expect(actions).toEqual([{ resize: { height: 1024 } }]);
  });

  it("returns null for an empty image", async () => {
    await expect(toJpegDataUrl("file:///x.jpg", 0, 0)).resolves.toBeNull();
  });
});
