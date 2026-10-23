import { formatCsvLine, parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("reads LF and CRLF line endings", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas, quotes and line breaks inside quoted fields", () => {
    expect(parseCsv('x,"a, ""b""\nc",y\n')).toEqual([["x", 'a, "b"\nc', "y"]]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });

  it("drops blank lines at the end", () => {
    expect(parseCsv("a\n\n\n")).toEqual([["a"]]);
  });

  it("returns no rows for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("throws on an unterminated quoted field", () => {
    expect(() => parseCsv('a,"open\n')).toThrow(SyntaxError);
  });

  it("reads a last line without a line break", () => {
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
  });
});

describe("formatCsvLine", () => {
  it("quotes only the fields that need it", () => {
    expect(formatCsvLine(["plain", "has,comma", 'has "quote"', "two\nlines"])).toBe(
      'plain,"has,comma","has ""quote""","two\nlines"',
    );
  });

  it("round trips through parseCsv", () => {
    const fields = ["a", "b,c", 'd"e', "f\ng", ""];
    expect(parseCsv(`${formatCsvLine(fields)}\n`)).toEqual([fields]);
  });
});
