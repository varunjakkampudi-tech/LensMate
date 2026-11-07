import * as ImagePicker from "expo-image-picker";
import { manipulateAsync } from "expo-image-manipulator";
import { pickImageFile } from "./camera.native";

// Native photo-library picker: the same resize limit and data-URL shape as the camera path.
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [null, jest.fn()],
}));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));

const launch = ImagePicker.launchImageLibraryAsync as unknown as jest.Mock;
const manipulate = manipulateAsync as unknown as jest.Mock;

/** Resolves once the picker's async work has finished, so the callback has been called (or not). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("native photo picker", () => {
  it("opens the image library for images only", async () => {
    launch.mockResolvedValue({ canceled: true, assets: [] });

    pickImageFile(jest.fn());
    await settle();

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images"] }));
  });

  it("does nothing when the user cancels, so no error is shown", async () => {
    launch.mockResolvedValue({ canceled: true, assets: [] });
    const onPicked = jest.fn();

    pickImageFile(onPicked);
    await settle();

    expect(onPicked).not.toHaveBeenCalled();
    expect(manipulate).not.toHaveBeenCalled();
  });

  it("returns the chosen photo as a resized JPEG data URL", async () => {
    launch.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///picked.jpg", width: 3024, height: 4032 }],
    });
    manipulate.mockResolvedValue({ base64: "QUJD" });
    const onPicked = jest.fn();

    pickImageFile(onPicked);
    await settle();
    await settle();

    expect(manipulate).toHaveBeenCalledWith(
      "file:///picked.jpg",
      [{ resize: { height: 1024 } }],
      expect.objectContaining({ base64: true }),
    );
    expect(onPicked).toHaveBeenCalledWith("data:image/jpeg;base64,QUJD");
  });

  it("reports null when the picked file cannot be resized, so the screen shows a message", async () => {
    launch.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///broken", width: 100, height: 100 }],
    });
    manipulate.mockRejectedValue(new Error("decode failed"));
    const onPicked = jest.fn();

    pickImageFile(onPicked);
    await settle();
    await settle();

    expect(onPicked).toHaveBeenCalledWith(null);
  });

  it("reports null when the library returns no asset", async () => {
    launch.mockResolvedValue({ canceled: false, assets: [] });
    const onPicked = jest.fn();

    pickImageFile(onPicked);
    await settle();

    expect(onPicked).toHaveBeenCalledWith(null);
  });

  it("reports null when the picker itself fails", async () => {
    launch.mockRejectedValue(new Error("picker unavailable"));
    const onPicked = jest.fn();

    pickImageFile(onPicked);
    await settle();

    expect(onPicked).toHaveBeenCalledWith(null);
  });
});
