/**
 * Pure logic for the virtual glasses screen: capture modes, the source label (LIVE CAMERA or SAMPLE), and the result
 * overlay state. Nothing here starts the camera or calls the broker.
 */
export const MODES = ["Scene", "OCR", "Objects", "Text"] as const;
export type Mode = (typeof MODES)[number];

export const PROMPTS: Record<Mode, string> = {
  Scene: "Name the scene in 1-3 words on the first line, then up to 3 short lines describing it.",
  OCR: "Read all readable text exactly. First line: 'Text found'. Then the text.",
  Objects: "First line: 'Objects'. Then list the main objects, one short line each, nearest first.",
  Text: "First line: a title for the main sign or label. Then explain what it says and means in 2 lines.",
};

/** Where the picture on screen came from. The label is always shown, so a sample is never mistaken for the camera. */
export type ImageSource = "live" | "photo" | "sample";

export function sourceLabel(source: ImageSource): string {
  switch (source) {
    case "live":
      return "LIVE CAMERA";
    case "photo":
      return "PHOTO";
    case "sample":
      return "SAMPLE";
  }
}

/** A short line that says what the answer is based on. Mock versus live is a separate badge elsewhere. */
export function answerBasis(source: ImageSource): string {
  return source === "sample"
    ? "Based on a sample image, not the camera."
    : source === "live"
      ? "Based on the photo from the camera."
      : "Based on a photo you chose.";
}

export type OverlayState =
  | { readonly kind: "hidden" }
  | { readonly kind: "working" }
  | { readonly kind: "answer"; readonly text: string };

/** The result overlay is shown only while there is something to show, and it never covers the shutter row. */
export function overlayState(busy: boolean, result: string | null): OverlayState {
  if (busy) {
    return { kind: "working" };
  }
  if (result === null || result === "") {
    return { kind: "hidden" };
  }
  return { kind: "answer", text: result };
}

/** Shutter: opens the camera when it is off, captures when it is on. Disabled while an analysis runs. */
export function shutterAction(
  live: boolean,
  busy: boolean,
): "open-camera" | "capture" | "disabled" {
  if (busy) {
    return "disabled";
  }
  return live ? "capture" : "open-camera";
}

/** Retake is offered only when a photo is held and the camera is off. */
export function canRetake(live: boolean, photo: string | null, busy: boolean): boolean {
  return !live && photo !== null && !busy;
}
