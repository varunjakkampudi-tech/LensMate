/* global console, process */
// Validates docs/lensmate tracking files (ChatGPT review CR-04, CR-05, CR-07).
// - 342 unique checklist IDs A01..Q22 with 7 cells per row and allowed values per field.
// - Blocker IDs referenced by rows must exist in BLOCKERS.md.
// - Every row with verification PASS or review APPROVED needs a structured evidence section
//   in VERIFICATION_EVIDENCE.md with a commit SHA, matching verification and review values, and tests.
// - IMPLEMENTATION_STATUS.md must list exact counts for every value of all three dimensions.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "lensmate");
const read = (name) => readFileSync(join(root, name), "utf8");

const IMPLEMENTATION = ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED"];
const VERIFICATION = ["NOT_TESTED", "PASS", "FAIL", "PARTIAL"];
const REVIEW = ["NOT_REQUESTED", "PENDING", "APPROVED", "CHANGES_REQUESTED"];
const HARDWARE = ["NOT_APPLICABLE", "PENDING", "PASS", "FAIL"];
const SECTION_SIZES = {
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
};

const errors = [];
const checklist = read("MASTER_CHECKLIST.md");
const blockers = read("BLOCKERS.md");
const evidence = read("VERIFICATION_EVIDENCE.md");
const status = read("IMPLEMENTATION_STATUS.md");

/** Returns the lines under a `## heading` (exact title match), up to the next `## ` heading. */
function sectionBody(markdown, title) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${title}`);
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i += 1) {
    body.push(lines[i]);
  }
  return body.join("\n");
}

/** Returns the evidence section whose heading starts with `## <id> `. */
function evidenceSection(id) {
  const lines = evidence.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${id} `));
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i += 1) {
    body.push(lines[i]);
  }
  return body.join("\n");
}

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
for (const [section, size] of Object.entries(SECTION_SIZES)) {
  for (let i = 1; i <= size; i += 1) {
    expected.push(`${section}${String(i).padStart(2, "0")}`);
  }
}
if (expected.length !== 342) errors.push(`internal: expected list has ${expected.length} IDs`);
if (rows.length !== 342) errors.push(`expected 342 checklist rows, found ${rows.length}`);
if (new Set(ids).size !== ids.length) errors.push("duplicate checklist IDs");
for (const id of expected) if (!ids.includes(id)) errors.push(`missing checklist ID ${id}`);

const counts = { implementation: {}, verification: {}, review: {} };
for (const value of IMPLEMENTATION) counts.implementation[value] = 0;
for (const value of VERIFICATION) counts.verification[value] = 0;
for (const value of REVIEW) counts.review[value] = 0;

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
  if (blocker !== "NONE" && !new RegExp(`\\b${blocker}\\b`).test(blockers)) {
    errors.push(`${id}: blocker "${blocker}" not defined in BLOCKERS.md`);
  }
  if (impl === "IMPLEMENTED" && verif === "NOT_TESTED") {
    errors.push(`${id}: IMPLEMENTED without any verification`);
  }
  if (review === "APPROVED" && verif !== "PASS") {
    errors.push(`${id}: APPROVED review requires verification PASS`);
  }

  if (verif === "PASS" || review === "APPROVED") {
    const section = evidenceSection(id);
    if (section === null) {
      errors.push(
        `${id}: ${verif} or APPROVED requires a "## ${id} ..." section in VERIFICATION_EVIDENCE.md`,
      );
    } else {
      const sha = /^- commit: ([0-9a-f]{7,40})$/m.exec(section);
      if (!sha) errors.push(`${id}: evidence needs a line "- commit: <sha>"`);
      if (!new RegExp(`^- verification: ${verif}$`, "m").test(section)) {
        errors.push(`${id}: evidence must contain "- verification: ${verif}" to match the row`);
      }
      if (!new RegExp(`^- review: ${review}$`, "m").test(section)) {
        errors.push(`${id}: evidence must contain "- review: ${review}" to match the row`);
      }
      if (!/^- tests: \S/m.test(section))
        errors.push(`${id}: evidence needs a non-empty "- tests:" line`);
    }
  }

  counts.implementation[impl] = (counts.implementation[impl] ?? 0) + 1;
  counts.verification[verif] = (counts.verification[verif] ?? 0) + 1;
  counts.review[review] = (counts.review[review] ?? 0) + 1;
}

// Every dimension, every allowed value: the summary must state the exact count (zero included).
const summaries = {
  implementation: "Summary (implementation field)",
  verification: "Summary (verification field)",
  review: "Summary (independent review field)",
};
for (const [dimension, title] of Object.entries(summaries)) {
  const body = sectionBody(status, title);
  if (body === null) {
    errors.push(`IMPLEMENTATION_STATUS.md must contain a "## ${title}" section`);
    continue;
  }
  const allowed = { implementation: IMPLEMENTATION, verification: VERIFICATION, review: REVIEW }[
    dimension
  ];
  for (const value of allowed) {
    const expectedLine = `- ${value}: ${counts[dimension][value] ?? 0}`;
    if (!body.split("\n").includes(expectedLine)) {
      errors.push(`IMPLEMENTATION_STATUS.md "${title}" must contain the line "${expectedLine}"`);
    }
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
