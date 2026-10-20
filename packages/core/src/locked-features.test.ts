import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Locked features (v9 section 20.3) have no code path, no API and no hidden flag. This test searches
 * the source of every workspace package for their names. It fails if one appears in a non-test file.
 * The pattern list covers identification, always-on capture, background recording and covert help.
 */
const REPO_ROOT = path.resolve(__dirname, "../../..");
const SEARCH_ROOTS = ["packages", "tools", "apps", "services"].map((dir) =>
  path.join(REPO_ROOT, dir),
);

const LOCKED_PATTERNS: readonly RegExp[] = [
  /face[_-]?(identif|recogn)/i,
  /identify[_-]?(person|people)/i,
  /voice[_-]?identif/i,
  /always[_-]?on[_-]?camera/i,
  /background[_-]?record/i,
  /covert[_-]?(interview|answer|help)/i,
];

/** Session names outside the P-1 scope must not exist in the protocol either (v9 section 21). */
const OUT_OF_SCOPE_SESSION_PATTERN = /SESSION_TYPE_(COMPANION|WALK|SOUND|HELPER)/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "coverage" ||
      entry === "android" ||
      entry === "ios"
    ) {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|proto)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("locked features are absent", () => {
  const files = SEARCH_ROOTS.flatMap((root) => sourceFiles(root));

  it("finds source files to search", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(LOCKED_PATTERNS)("no source file matches %p", (pattern) => {
    const hits = files.filter((file) => pattern.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("the protocol has no session type for an out-of-scope session", () => {
    const protoFile = path.join(REPO_ROOT, "packages/protocol/proto/lensmate/v1/link.proto");
    expect(OUT_OF_SCOPE_SESSION_PATTERN.test(readFileSync(protoFile, "utf8"))).toBe(false);
  });
});
