import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Linking, View } from "react-native";
import { Btn, Notice } from "../ui/kit";

/**
 * Phone camera (Expo Go and development builds, via expo-camera). Same exports as camera.tsx.
 *
 * The camera runs only while this view is mounted inside a camera session. Leaving the screen unmounts CameraView, which
 * releases the camera. Nothing here records audio or runs in the background. A photo is sent only after the user taps
 * "Take photo" and asks a question.
 */
export interface CameraHandle {
  capture(): Promise<string | null>;
}

const MAX_SIDE = 1024;

/** Resizes a photo so its long side is at most MAX_SIDE, and returns it as a JPEG data URL. */
export async function toJpegDataUrl(
  uri: string,
  width: number,
  height: number,
): Promise<string | null> {
  if (width === 0 || height === 0) {
    return null;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const resize =
    width >= height ? { width: Math.round(width * scale) } : { height: Math.round(height * scale) };
  const out = await manipulateAsync(uri, [{ resize }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return out.base64 === undefined ? null : `data:image/jpeg;base64,${out.base64}`;
}

export interface CaptureGateDeps {
  /** True only when the preview is mounted and the camera permission is granted. */
  ready(): boolean;
  /** Takes the photo. Throws if the camera fails. */
  takePicture(): Promise<{ uri: string; width: number; height: number }>;
  /** Resizes and encodes a photo. Returns null when the image cannot be encoded. */
  encode(uri: string, width: number, height: number): Promise<string | null>;
  /** True while the component is still mounted. Results after unmount are discarded. */
  isMounted(): boolean;
  /** Shows a short user-facing message. Never receives device or library error text. */
  onError(message: string): void;
}

/**
 * One capture at a time. A second call while a capture runs returns null without taking a second photo. Capture returns
 * null when the camera is not ready, when the component has gone, or when taking or encoding the photo fails; a failure
 * is also reported through onError.
 */
export function createCaptureGate(deps: CaptureGateDeps): () => Promise<string | null> {
  let inFlight = false;
  return async () => {
    if (inFlight || !deps.ready()) {
      return null;
    }
    inFlight = true;
    try {
      const photo = await deps.takePicture();
      const dataUrl = await deps.encode(photo.uri, photo.width, photo.height);
      return deps.isMounted() ? dataUrl : null;
    } catch {
      if (deps.isMounted()) {
        deps.onError("The photo could not be taken. Try again, or upload a photo instead.");
      }
      return null;
    } finally {
      inFlight = false;
    }
  };
}

export function pickImageFile(onPicked: (dataUrl: string | null) => void): void {
  void (async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    if (asset === undefined) {
      onPicked(null);
      return;
    }
    onPicked(await toJpegDataUrl(asset.uri, asset.width, asset.height).catch(() => null));
  })().catch(() => onPicked(null));
}

/**
 * Live preview with an explicit permission step. Denial is recoverable: the message says what to do, and the Settings
 * link opens the phone's app settings. No preview starts without permission.
 */
export const CameraPreview = forwardRef<CameraHandle, { onError: (message: string) => void }>(
  function CameraPreview({ onError }, ref) {
    const [permission, requestPermission] = useCameraPermissions();
    const view = useRef<CameraView | null>(null);
    const granted = useRef(false);
    const mounted = useRef(true);
    const reportError = useRef(onError);
    reportError.current = onError;
    granted.current = permission?.granted === true;

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    const gate = useMemo(
      () =>
        createCaptureGate({
          ready: () => view.current !== null && granted.current,
          takePicture: async () => {
            if (view.current === null) {
              throw new Error("CAMERA_NOT_READY");
            }
            return view.current.takePictureAsync({ quality: 1, skipProcessing: true });
          },
          encode: toJpegDataUrl,
          isMounted: () => mounted.current,
          onError: (message) => reportError.current(message),
        }),
      [],
    );

    useImperativeHandle(ref, () => ({ capture: gate }), [gate]);

    if (permission === null) {
      return null;
    }
    if (!permission.granted) {
      const blocked = permission.canAskAgain === false;
      return (
        <View style={{ gap: 10 }} testID="camera-permission">
          <Notice tone="warn">
            {blocked
              ? "Camera access is off for LensMate. Turn it on in the phone's Settings, then come back."
              : "LensMate needs the camera to see what you point it at. Nothing is recorded in the background."}
          </Notice>
          {blocked ? (
            <Btn
              testID="camera-open-settings"
              label="Open Settings"
              tone="ghost"
              onPress={() => void Linking.openSettings()}
            />
          ) : (
            <Btn
              testID="camera-allow"
              label="Allow camera"
              icon="camera"
              onPress={() =>
                void requestPermission().then((r) => {
                  if (!r.granted) {
                    onError("Camera permission was refused. You can upload a photo instead.");
                  }
                })
              }
            />
          )}
        </View>
      );
    }
    return (
      <CameraView
        ref={view}
        testID="camera-preview"
        facing="back"
        style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 16, overflow: "hidden" }}
      />
    );
  },
);
