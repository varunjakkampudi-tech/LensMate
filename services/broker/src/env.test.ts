import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEnvValue } from "./env.js";

describe("readEnvValue", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "broker-env-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a direct value, trimmed", () => {
    expect(readEnvValue({ NAME: "  value  " }, "NAME")).toBe("value");
  });

  it("reads a file named by NAME_FILE, trimmed", () => {
    const path = join(dir, "secret");
    writeFileSync(path, "file-value\n");
    expect(readEnvValue({ NAME_FILE: path }, "NAME")).toBe("file-value");
  });

  it("treats an empty value as absent", () => {
    expect(readEnvValue({ NAME: "   " }, "NAME")).toBeUndefined();
    expect(readEnvValue({}, "NAME")).toBeUndefined();
  });

  it("refuses both NAME and NAME_FILE, without revealing either value", () => {
    expect(() => readEnvValue({ NAME: "a-value", NAME_FILE: "/x" }, "NAME")).toThrow(
      "set NAME or NAME_FILE, not both",
    );
  });

  it("reports an unreadable file without its path or contents", () => {
    const missing = join(dir, "does-not-exist");
    let message = "";
    try {
      readEnvValue({ NAME_FILE: missing }, "NAME");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("NAME_FILE could not be read");
    expect(message).not.toContain(missing);
  });
});
