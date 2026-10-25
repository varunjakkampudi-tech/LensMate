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

const CAPTURE_MODULE_PATTERN =
  /from\s+["'](expo-camera|expo-image-picker|expo-image-manipulator|expo-av|expo-audio)["']/;
/** Call sites only. A feature check such as `typeof getUserMedia === "function"` is not a capture. */
const CAPTURE_API_PATTERN =
  /\.getUserMedia\s*\(|<CameraView\b|\buseCameraPermissions\s*\(|\blaunchCameraAsync\s*\(/;

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
