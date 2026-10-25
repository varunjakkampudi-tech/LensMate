import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Runs the real backup guard (deploy/backup/lib.sh) in bash. A URL that would put a password on the command line must be
 * refused before any database tool runs. The URLs below are fixtures; the passwords are not real.
 */
const LIB = resolve(__dirname, "../deploy/backup/lib.sh");
const BASH = findBash();

function findBash(): string {
  if (process.platform !== "win32") {
    return "bash";
  }
  const candidates = [
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
  ];
  return candidates.find(existsSync) ?? "bash";
}

function runBash(args: string[]) {
  const result = spawnSync(BASH, args, { encoding: "utf8" });
  if (result.error !== undefined) {
    throw new Error(`could not run bash executable ${BASH}: ${result.error.message}`);
  }
  return result;
}

function refusedMany(urls: string[]): boolean[] {
  const result = runBash([
    "-c",
    'source "$1" || exit $?; shift; for url in "$@"; do (refuse_password_in_url "$url" backup >/dev/null 2>&1); printf "%s\\n" "$?"; done',
    "guard",
    LIB,
    ...urls,
  ]);
  if (result.status !== 0) {
    throw new Error(
      `backup guard command failed with status ${String(result.status)}: ${result.stderr}`,
    );
  }
  const statuses = result.stdout.trim().split(/\r?\n/).map(Number);
  if (statuses.length !== urls.length || statuses.some((status) => status !== 0 && status !== 1)) {
    throw new Error(`backup guard returned unexpected statuses: ${result.stdout}`);
  }
  return statuses.map((status) => status === 1);
}

describe("backup connection guard (lib.sh)", () => {
  it("refuses every form that puts a password on the command line", () => {
    const urls = [
      "postgres://broker_backup:fixture-pass@db:5432/broker",
      "postgres://broker_backup:fixture/with-slash@db:5432/broker",
      "postgres://db/broker?password=fixture-pass",
      "postgres://db/broker?PassWord=fixture-pass",
      "host=db dbname=broker password=fixture-pass",
      "dbname=broker password = fixture-pass",
      "mysql://broker_backup@db/broker",
    ];
    expect(refusedMany(urls)).toEqual([true, true, true, true, true, true, true]);
  });

  it("accepts a password-free postgres URL", () => {
    expect(
      refusedMany(["postgres://broker_backup@db:5432/broker", "postgresql://db:5432/broker"]),
    ).toEqual([false, false]);
  });
});

describe("backup guard additions", () => {
  it("refuses libpq parameters whose names contain pass, such as sslpassword", () => {
    expect(
      refusedMany([
        "postgres://db/broker?sslpassword=fixture-pass",
        "postgres://db/broker?passfile=/tmp/x",
      ]),
    ).toEqual([true, true]);
  });

  it("refuses an encryption key and an integrity key that are the same file", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-keys-"));
    try {
      const key = join(dir, "same.key");
      writeFileSync(key, "k".repeat(40));
      const result = runBash([
        "-c",
        'source "$1"; require_distinct_keys "$2" "$2" backup',
        "guard",
        LIB,
        key,
      ]);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts distinct encryption and integrity key files", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-distinct-keys-"));
    try {
      const encryptionKey = join(dir, "encryption.key");
      const integrityKey = join(dir, "integrity.key");
      writeFileSync(encryptionKey, "k".repeat(40));
      writeFileSync(integrityKey, "m".repeat(40));
      const result = runBash([
        "-c",
        'source "$1"; require_distinct_keys "$2" "$3" backup',
        "guard",
        LIB,
        encryptionKey,
        integrityKey,
      ]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses keys that match after trimming a leading newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-leading-newline-"));
    try {
      const encryptionKey = join(dir, "encryption.key");
      const integrityKey = join(dir, "integrity.key");
      writeFileSync(encryptionKey, `\n${"k".repeat(40)}`);
      writeFileSync(integrityKey, "k".repeat(40));
      const result = runBash([
        "-c",
        'source "$1"; require_distinct_keys "$2" "$3" backup',
        "guard",
        LIB,
        encryptionKey,
        integrityKey,
      ]);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("backup guard, percent-encoded names and whitespace-only key differences", () => {
  it("refuses percent-encoded parameter names, which libpq decodes", () => {
    expect(
      refusedMany([
        "postgres://db/broker?%70assword=fixture-pass",
        "postgres://db/broker?p%61ssword=fixture-pass",
      ]),
    ).toEqual([true, true]);
  });

  it("treats two key files that differ only by a trailing newline as the same key", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-keys-ws-"));
    try {
      const a = join(dir, "a.key");
      const b = join(dir, "b.key");
      writeFileSync(a, "k".repeat(40));
      writeFileSync(b, `${"k".repeat(40)}\n`);
      const result = runBash([
        "-c",
        'source "$1"; require_distinct_keys "$2" "$3" backup',
        "guard",
        LIB,
        a,
        b,
      ]);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("backup guard, first-line key match", () => {
  it("refuses keys that share their first line, because openssl reads only that line", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-first-line-"));
    try {
      const first = join(dir, "enc.key");
      const second = join(dir, "mac.key");
      writeFileSync(first, `${"k".repeat(40)}\nextra material`);
      writeFileSync(second, `${"k".repeat(40)}\nother material`);
      const result = runBash([
        "-c",
        'source "$1"; require_distinct_keys "$2" "$3" backup',
        "guard",
        LIB,
        first,
        second,
      ]);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
