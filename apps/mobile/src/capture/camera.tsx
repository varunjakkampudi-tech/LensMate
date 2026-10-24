import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Platform, Text, View } from "react-native";
import { useTheme } from "../ui/theme";

export interface CameraHandle {
  capture(): string | null;
}

const MAX_SIDE = 1024;

/** Downscales any image source to a JPEG data URL well under the broker's 1 MB image limit. */
function toJpeg(source: CanvasImageSource, width: number, height: number): string | null {
  if (width === 0 || height === 0) {
    return null;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function fileToJpeg(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(toJpeg(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

export function pickImageFile(onPicked: (dataUrl: string | null) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    void fileToJpeg(file).then(onPicked);
  };
  input.click();
}

/**
 * Live camera preview. The stream exists only while this view is mounted inside a camera session; unmounting stops
 * every track, so the camera never keeps running in the background (G5, Locked: always-on camera).
 */
export const CameraPreview = forwardRef<CameraHandle, { onError: (message: string) => void }>(
  function CameraPreview({ onError }, ref) {
    const { c } = useTheme();
    const video = useRef<HTMLVideoElement | null>(null);

    useImperativeHandle(ref, () => ({
      capture: () =>
        video.current === null
          ? null
          : toJpeg(video.current, video.current.videoWidth, video.current.videoHeight),
    }));

    useEffect(() => {
      if (Platform.OS !== "web") {
        return;
      }
      let stream: MediaStream | null = null;
      let cancelled = false;
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" }, audio: false })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          if (video.current !== null) {
            video.current.srcObject = s;
            void video.current.play();
          }
        })
        .catch(() =>
          onError("Camera unavailable or permission refused. You can upload a photo instead."),
        );
      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, [onError]);

    if (Platform.OS !== "web") {
      return (
        <View style={{ padding: 16 }}>
          <Text style={{ color: c.muted }}>
            The phone camera needs the development build (native camera module).
          </Text>
        </View>
      );
    }
    return createElement("video", {
      ref: video,
      playsInline: true,
      muted: true,
      "data-testid": "camera-preview",
      style: {
        width: "100%",
        aspectRatio: "4 / 3",
        objectFit: "cover",
        borderRadius: 16,
        background: "#000",
      },
    });
  },
);
