import { formatBuildLine } from "./build-info";

describe("formatBuildLine", () => {
  it("says the build time is not recorded when no time is known", () => {
    expect(formatBuildLine(null)).toBe("Build time not recorded");
  });

  it("shows the build date and time with the label", () => {
    const line = formatBuildLine("2026-10-26T12:44:00.000Z");
    expect(line.startsWith("Last deployed: ")).toBe(true);
    expect(line).toMatch(/2026/);
  });
});
