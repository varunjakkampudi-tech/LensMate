import { READ_TEXT_REQUEST, TRANSLATE_TEXT_REQUEST } from "./assistant";

describe("read visible text request", () => {
  it("asks for exact wording and marks unclear words instead of guessing", () => {
    expect(READ_TEXT_REQUEST).toMatch(/exactly/i);
    expect(READ_TEXT_REQUEST).toContain("[unclear]");
    expect(READ_TEXT_REQUEST).toMatch(/no readable text/i);
  });
});

describe("translate visible text request", () => {
  it("reads in any language, gives the text in the reply language, and keeps the no-guessing marks", () => {
    expect(TRANSLATE_TEXT_REQUEST).toMatch(/whatever language/i);
    expect(TRANSLATE_TEXT_REQUEST).toMatch(/reply language/i);
    expect(TRANSLATE_TEXT_REQUEST).toContain("[unclear]");
    expect(TRANSLATE_TEXT_REQUEST).toMatch(/no readable text/i);
  });
});
