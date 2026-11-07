import { BrokerError } from "@lensmate/core";
import { aiErrorText, plain } from "./assistant";
import { BrokerCallBlocked } from "../broker-call";

describe("assistant helpers", () => {
  it("strips markdown emphasis and headings for speech", () => {
    expect(plain("## Title\n**bold** and __under__\n- item")).toBe("Title\nbold and under\n• item");
  });

  it("explains refusals in plain words", () => {
    expect(aiErrorText(new BrokerCallBlocked("NOT_ENROLLED"))).toMatch(/Enrol this phone/);
    expect(aiErrorText(new BrokerError("BUDGET_EXHAUSTED", "PROVIDER_ERROR", false))).toMatch(
      /cap/,
    );
    expect(aiErrorText(new Error("x"))).toMatch(/went wrong/);
  });
});
