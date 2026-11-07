import { READ_TEXT_REQUEST } from "./assistant";

describe("read visible text request", () => {
  it("asks for exact wording and marks unclear words instead of guessing", () => {
    expect(READ_TEXT_REQUEST).toMatch(/exactly/i);
    expect(READ_TEXT_REQUEST).toContain("[unclear]");
    expect(READ_TEXT_REQUEST).toMatch(/no readable text/i);
  });
});
