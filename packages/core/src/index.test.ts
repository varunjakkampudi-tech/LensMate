import { CORE_PACKAGE_VERSION } from "./index.js";

describe("@smartglass/core", () => {
  it("exports a semantic package version", () => {
    expect(CORE_PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
