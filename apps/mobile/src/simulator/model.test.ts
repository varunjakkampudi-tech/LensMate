import {
  MODES,
  PROMPTS,
  answerBasis,
  canRetake,
  overlayState,
  shutterAction,
  sourceLabel,
} from "./model";

describe("simulator modes", () => {
  it("offers the four glasses modes in order, each with a prompt", () => {
    expect(MODES).toEqual(["Scene", "OCR", "Objects", "Text"]);
    for (const m of MODES) {
      expect(PROMPTS[m].length).toBeGreaterThan(10);
    }
  });
});

describe("source labels", () => {
  it("labels live camera and sample images distinctly", () => {
    expect(sourceLabel("live")).toBe("LIVE CAMERA");
    expect(sourceLabel("sample")).toBe("SAMPLE");
    expect(sourceLabel("photo")).toBe("PHOTO");
  });

  it("never describes a sample as a camera answer", () => {
    expect(answerBasis("sample")).toMatch(/sample image, not the camera/);
    expect(answerBasis("live")).toMatch(/camera/);
  });
});

describe("result overlay", () => {
  it("is hidden with no result and no work", () => {
    expect(overlayState(false, null)).toEqual({ kind: "hidden" });
    expect(overlayState(false, "")).toEqual({ kind: "hidden" });
  });

  it("shows working while analysing, even with an old result", () => {
    expect(overlayState(true, "old")).toEqual({ kind: "working" });
  });

  it("shows the answer text when there is one", () => {
    expect(overlayState(false, "A desk lamp")).toEqual({ kind: "answer", text: "A desk lamp" });
  });
});

describe("shutter and retake", () => {
  it("opens the camera when off, captures when on, and is disabled while busy", () => {
    expect(shutterAction(false, false)).toBe("open-camera");
    expect(shutterAction(true, false)).toBe("capture");
    expect(shutterAction(true, true)).toBe("disabled");
    expect(shutterAction(false, true)).toBe("disabled");
  });

  it("offers retake only with a held photo and the camera off", () => {
    expect(canRetake(false, "data:x", false)).toBe(true);
    expect(canRetake(true, "data:x", false)).toBe(false);
    expect(canRetake(false, null, false)).toBe(false);
    expect(canRetake(false, "data:x", true)).toBe(false);
  });
});
