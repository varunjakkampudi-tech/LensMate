import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Runs the real backup guard (deploy/backup/lib.sh) in bash. A URL that would put a password on the command line must be
 * refused before any database tool runs. The URLs below are fixtures; the passwords are not real.
 */
const LIB = resolve(__dirname, "../deploy/backup/lib.sh");

function refused(url: string): boolean {
  const result = spawnSync(
    "bash",
    ["-c", 'source "$1"; refuse_password_in_url "$2" backup', "guard", LIB, url],
    { encoding: "utf8" },
  );
  return result.status !== 0;
}

describe("backup connection guard (lib.sh)", () => {
  it("refuses every form that puts a password on the command line", () => {
    for (const url of [
      "postgres://broker_backup:fixture-pass@db:5432/broker",
      "postgres://broker_backup:fixture/with-slash@db:5432/broker",
      "postgres://db/broker?password=fixture-pass",
      "postgres://db/broker?PassWord=fixture-pass",
      "host=db dbname=broker password=fixture-pass",
      "dbname=broker password = fixture-pass",
      "mysql://broker_backup@db/broker",
    ]) {
      expect(refused(url)).toBe(true);
    }
  });

  it("accepts a password-free postgres URL", () => {
    expect(refused("postgres://broker_backup@db:5432/broker")).toBe(false);
    expect(refused("postgresql://db:5432/broker")).toBe(false);
  });
});

describe("backup guard additions", () => {
  it("refuses libpq parameters whose names contain pass, such as sslpassword", () => {
    expect(refused("postgres://db/broker?sslpassword=fixture-pass")).toBe(true);
    expect(refused("postgres://db/broker?passfile=/tmp/x")).toBe(true);
  });

  it("refuses an encryption key and an integrity key that are the same file", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-keys-"));
    try {
      const key = join(dir, "same.key");
      writeFileSync(key, "k".repeat(40));
      const result = spawnSync(
        "bash",
        ["-c", 'source "$1"; require_distinct_keys "$2" "$2" backup', "guard", LIB, key],
        { encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
