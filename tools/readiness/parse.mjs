// Reads the three tables of FEATURE_MATRIX.md. Columns are matched by position, which the matrix keeps fixed:
// 0 ID, 1 name, 2 v9 section, 3 tier or class, 4 release or phase, 5 P-1 scope, 6 status, 7 evidence level,
// 8 implementation files, 9 test files, 10 remaining work, 11 blocker or owner dependency.
const SECTIONS = {
  "## Table A": "features",
  "## Table B": "features",
  "## Table C": "checklist",
};

export const STATUSES = [
  "Specified",
  "Unverified",
  "Implemented",
  "Tested",
  "Measured",
  "READY_FOR_OWNER",
  "Hardware-pending",
  "Blocked",
  "Integrated",
  "NOT_DUE",
];

function cells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

export function parseMatrix(text) {
  const dateMatch = /Dated (\d{4}-\d{2}-\d{2})/.exec(text);
  if (dateMatch === null) {
    throw new Error("FEATURE_MATRIX.md has no 'Dated YYYY-MM-DD' line");
  }
  const entries = [];
  let section = null;
  for (const line of text.split("\n")) {
    const heading = Object.keys(SECTIONS).find((h) => line.startsWith(h));
    if (heading !== undefined) {
      section = SECTIONS[heading];
      continue;
    }
    if (line.startsWith("## ")) {
      section = null;
      continue;
    }
    if (
      section === null ||
      !line.startsWith("| ") ||
      line.startsWith("| ---") ||
      line.startsWith("| ID")
    ) {
      continue;
    }
    const c = cells(line);
    if (c.length < 12) {
      throw new Error(`matrix row has ${c.length} columns: ${line.slice(0, 60)}`);
    }
    const status = c[6];
    if (!STATUSES.includes(status)) {
      throw new Error(`unknown status "${status}" on ${c[0]}`);
    }
    entries.push({
      id: c[0],
      name: c[1],
      kind: section,
      v9Section: c[2],
      tier: c[3],
      phase: c[4],
      p1Scope: /^Yes/.test(c[5]),
      status,
      evidence: c[7],
      remaining: c[10],
      blocker: c[11],
    });
  }
  return { date: dateMatch[1], entries };
}
