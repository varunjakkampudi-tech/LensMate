/* global console, process */
// Validates docs/lensmate tracking files (ChatGPT review CR-04 and CR-05).
// Checks: unique checklist IDs A01..Q22, valid status values per field,
// evidence entries for PASS rows, blocker references, and summary counts.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "lensmate");
const read = (name) => readFileSync(join(root, name), "utf8");

const IMPLEMENTATION = ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED"];
const VERIFICATION = ["NOT_TESTED", "PASS", "FAIL", "PARTIAL"];
const REVIEW = ["NOT_REQUESTED", "PENDING", "APPROVED", "CHANGES_REQUESTED"];
const HARDWARE = ["NOT_APPLICABLE", "PENDING", "PASS", "FAIL"];

const errors = [];
const checklist = read("MASTER_CHECKLIST.md");
const blockers = read("BLOCKERS.md");
const evidence = read("VERIFICATION_EVIDENCE.md");
const status = read("IMPLEMENTATION_STATUS.md");

const rows = checklist
  .split("\n")
  .filter((line) => /^\| [A-Q]\d{2} \|/.test(line))
  .map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );

const ids = rows.map((cells) => cells[0]);
const expected = [];
for (const section of "ABCDEFGHIJKLMNOPQ") {
  const count = {
    A: 28,
    B: 26,
    C: 21,
    D: 20,
    E: 21,
    F: 17,
    G: 24,
    H: 17,
    I: 18,
    J: 14,
    K: 20,
    L: 19,
    M: 20,
    N: 23,
    O: 17,
    P: 15,
    Q: 22,
  }[section];
  for (let i = 1; i <= count; i += 1) {
    expected.push(`${section}${String(i).padStart(2, "0")}`);
  }
}
if (rows.length !== 342) errors.push(`expected 342 checklist rows, found ${rows.length}`);
if (new Set(ids).size !== ids.length) errors.push("duplicate checklist IDs");
for (const id of expected) if (!ids.includes(id)) errors.push(`missing checklist ID ${id}`);

const counts = { implementation: {}, verification: {}, review: {} };
for (const cells of rows) {
  if (cells.length !== 7) {
    errors.push(`${cells[0]}: expected 7 cells, found ${cells.length}`);
    continue;
  }
  const [id, , impl, verif, review, blocker, hw] = cells;
  if (!IMPLEMENTATION.includes(impl)) errors.push(`${id}: invalid implementation "${impl}"`);
  if (!VERIFICATION.includes(verif)) errors.push(`${id}: invalid verification "${verif}"`);
  if (!REVIEW.includes(review)) errors.push(`${id}: invalid review "${review}"`);
  if (!HARDWARE.includes(hw)) errors.push(`${id}: invalid hardware validation "${hw}"`);
  if (blocker !== "NONE" && !new RegExp(`\b${blocker}\b`).test(blockers)) {
    errors.push(`${id}: blocker "${blocker}" not defined in BLOCKERS.md`);
  }
  if (verif === "PASS" && !new RegExp(`\\b${id}\\b`).test(evidence)) {
    errors.push(`${id}: PASS without an entry in VERIFICATION_EVIDENCE.md`);
  }
  if (impl === "IMPLEMENTED" && verif === "NOT_TESTED") {
    errors.push(`${id}: IMPLEMENTED without any verification`);
  }
  if (review === "APPROVED" && verif !== "PASS") {
    errors.push(`${id}: APPROVED review requires verification PASS`);
  }
  counts.implementation[impl] = (counts.implementation[impl] ?? 0) + 1;
  counts.verification[verif] = (counts.verification[verif] ?? 0) + 1;
  counts.review[review] = (counts.review[review] ?? 0) + 1;
}

// Summary counts in IMPLEMENTATION_STATUS.md must match the checklist.
for (const [value, count] of Object.entries(counts.implementation)) {
  if (!status.includes(`- ${value}: ${count}`)) {
    errors.push(`IMPLEMENTATION_STATUS.md summary must contain "- ${value}: ${count}"`);
  }
}
if (!status.includes(`Checklist items: ${rows.length}`)) {
  errors.push(`IMPLEMENTATION_STATUS.md must state "Checklist items: ${rows.length}"`);
}

if (errors.length > 0) {
  console.error(`LensMate tracking validation failed (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  `LensMate tracking OK: ${rows.length} items; implementation ${JSON.stringify(counts.implementation)}; verification ${JSON.stringify(counts.verification)}; review ${JSON.stringify(counts.review)}`,
);
