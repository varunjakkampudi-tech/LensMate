import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY, REGISTRY_VERSION, MATRIX_DATE } from "./registry";
import { completionPercent, evidenceLevels, stateOf, type ReadinessEntry } from "./model";

// Independent check against the matrix text: the registry must agree with FEATURE_MATRIX.md row by row.
const matrix = readFileSync(join(__dirname, "../../../../FEATURE_MATRIX.md"), "utf8");

function matrixStatuses(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of matrix.split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| ---") || line.startsWith("| ID")) {
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length >= 12 && /^(F|B|H|U|CL)\d+$/.test(cells[0] ?? "")) {
      rows.set(`${cells[0]}`, cells[6] ?? "");
    }
  }
  return rows;
}

describe("feature readiness registry", () => {
  it("has one entry for every row of the matrix, with the same status", () => {
    const fromMatrix = matrixStatuses();
    expect(REGISTRY.length).toBe(fromMatrix.size);
    for (const entry of REGISTRY) {
      expect(fromMatrix.get(entry.id)).toBe(entry.status);
    }
  });

  it("is generated at a known registry version", () => {
    expect(REGISTRY_VERSION).toBe(1);
  });

  it("records the matrix date it was generated from", () => {
    expect(MATRIX_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(matrix).toContain(`Dated ${MATRIX_DATE}`);
  });

  it("never gives 100 percent", () => {
    for (const entry of REGISTRY) {
      const pct = completionPercent(entry);
      if (pct !== null) {
        expect(pct).toBeLessThan(100);
      }
    }
  });

  it("gives no percentage to future (NOT_DUE) rows and marks them Future", () => {
    const future = REGISTRY.filter((e) => e.status === "NOT_DUE");
    expect(future.length).toBeGreaterThan(0);
    for (const entry of future) {
      expect(completionPercent(entry)).toBeNull();
      expect(stateOf(entry)).toBe("Future");
    }
  });

  it("shows nothing as Ready while the matrix records no owner-run device evidence", () => {
    const ready = REGISTRY.filter((e) => stateOf(e) === "Ready");
    expect(ready).toEqual([]);
  });

  it("maps specified-only rows to Not started and blocked rows to Blocked", () => {
    const specified = REGISTRY.find((e) => e.status === "Specified");
    expect(specified).toBeDefined();
    expect(stateOf(specified as ReadinessEntry)).toBe("Not started");
    const blocked = REGISTRY.find((e) => e.status === "Blocked");
    if (blocked !== undefined) {
      expect(stateOf(blocked)).toBe("Blocked");
    }
  });

  it("reports the evidence the matrix names, and 'unknown' when it names none", () => {
    const fake = { ...REGISTRY[0], evidence: "Nothing recorded here" } as ReadinessEntry;
    expect(evidenceLevels(fake)).toEqual(["unknown"]);
    const mock = { ...REGISTRY[0], evidence: "MOCK (broker vision route)" } as ReadinessEntry;
    expect(evidenceLevels(mock)).toContain("MOCK");
  });

  it("keeps the scoring policy explicit: a larger status never scores lower", () => {
    const order = [
      "Specified",
      "Unverified",
      "Implemented",
      "Tested",
      "Measured",
      "Integrated",
    ] as const;
    const scores = order.map(
      (s) => completionPercent({ ...REGISTRY[0], status: s } as ReadinessEntry) ?? -1,
    );
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});
