import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Browser camera (web). The phone build uses camera.native.tsx, which has the same exports. Both return a JPEG data
 * URL of at most 1024 px on the long side, so the broker's image limit holds on either platform.
 */
export interface CameraHandle {
  capture(): Promise<string | null>;
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
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve(toJpeg(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
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
    const video = useRef<HTMLVideoElement | null>(null);

    useImperativeHandle(ref, () => ({
      capture: async () =>
        video.current === null
          ? null
          : toJpeg(video.current, video.current.videoWidth, video.current.videoHeight),
    }));

    // Held in a ref so a parent that passes a new callback each render does not restart the camera.
    const reportError = useRef(onError);
    reportError.current = onError;

    useEffect(() => {
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
          reportError.current(
            "Camera unavailable or permission refused. You can upload a photo instead.",
          ),
        );
      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, []);

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
