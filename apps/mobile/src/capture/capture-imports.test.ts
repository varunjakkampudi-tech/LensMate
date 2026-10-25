import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Hidden-capture guard (v9 privacy, item 17). Camera and photo-library APIs may be imported only by the capture
 * module, so no other screen or service can take a photo or read the library without the capture screen. This is a
 * static check over source text: it runs no device and calls no provider. MOCK-level evidence, not device evidence.
 */
const MOBILE_ROOT = path.resolve(__dirname, "../..");
const SEARCH_ROOTS = [path.join(MOBILE_ROOT, "src"), path.join(MOBILE_ROOT, "app")];
const CAPTURE_DIR = path.join(MOBILE_ROOT, "src", "capture");

/** Any quoted module name, so static, dynamic, require, re-export and side-effect imports are all caught. */
const CAPTURE_MODULE_PATTERN =
  /["'`](expo-camera|expo-image-picker|expo-image-manipulator|expo-av|expo-audio)["'`]/;
/** Call sites only. A feature check such as `typeof getUserMedia === "function"` is not a capture. */
const CAPTURE_API_PATTERN =
  /\.getUserMedia\s*\(|<CameraView\b|\buseCameraPermissions\s*\(|\blaunch(?:Camera|ImageLibrary)Async\s*\(/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function importsCaptureModule(source: string): boolean {
  return CAPTURE_MODULE_PATTERN.test(source);
}

function callsCaptureApi(source: string): boolean {
  return CAPTURE_API_PATTERN.test(source);
}

/** One snippet per import form that can reach a camera or picker module. Each must be flagged outside src/capture. */
describe("hidden-capture guard recognises every import form", () => {
  it.each([
    ["static import", `import { CameraView } from "expo-camera";`],
    ["re-export", `export { launchCameraAsync } from "expo-image-picker";`],
    ["re-export of all", `export * from "expo-camera";`],
    ["dynamic import", `const { launchImageLibraryAsync } = await import("expo-image-picker");`],
    ["dynamic import with single quotes", `const cam = await import('expo-camera');`],
    ["require", `const ImagePicker = require("expo-image-picker");`],
    ["side-effect import", `import "expo-camera";`],
  ])("flags a %s of a camera or picker module", (_name, snippet) => {
    expect(importsCaptureModule(snippet)).toBe(true);
  });

  it.each([
    ["direct call", `await launchImageLibraryAsync({ mediaTypes: "images" });`],
    ["member call", `await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images" });`],
  ])("flags a %s to a photo-library API", (_name, snippet) => {
    expect(callsCaptureApi(snippet)).toBe(true);
  });
});

describe("hidden-capture guard", () => {
  const files = SEARCH_ROOTS.flatMap((root) => sourceFiles(root));
  const outsideCapture = files.filter((file) => !file.startsWith(CAPTURE_DIR + path.sep));

  it("finds source files to search", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("the capture module does use the camera and photo-library APIs, so the check is not vacuous", () => {
    const captureHits = files
      .filter((file) => file.startsWith(CAPTURE_DIR + path.sep))
      .filter((file) => CAPTURE_MODULE_PATTERN.test(readFileSync(file, "utf8")));
    expect(captureHits.length).toBeGreaterThan(0);
  });

  it("no file outside src/capture imports a camera or photo-library module", () => {
    const hits = outsideCapture.filter((file) =>
      CAPTURE_MODULE_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(hits.map((file) => path.relative(MOBILE_ROOT, file))).toEqual([]);
  });

  it("no file outside src/capture calls a camera or capture API directly", () => {
    const hits = outsideCapture.filter((file) =>
      CAPTURE_API_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(hits.map((file) => path.relative(MOBILE_ROOT, file))).toEqual([]);
  });
});
