import { SpendCap } from "./spend-cap.js";

describe("SpendCap", () => {
  it("allows a call that fits under the cap", () => {
    expect(new SpendCap(50000).decide(100)).toEqual({ allowed: true });
  });

  it("allows a call that lands exactly on the cap", () => {
    expect(new SpendCap(500, 400).decide(100)).toEqual({ allowed: true });
  });

  it("stops the next call once the cap would be exceeded", () => {
    expect(new SpendCap(500, 400).decide(101)).toEqual({ allowed: false, reason: "CAP_REACHED" });
  });

  it("refuses an estimated cost that is not a non-negative integer", () => {
    const cap = new SpendCap(500);
    expect(cap.decide(-1)).toEqual({ allowed: false, reason: "INVALID_AMOUNT" });
    expect(cap.decide(1.5)).toEqual({ allowed: false, reason: "INVALID_AMOUNT" });
    expect(cap.decide(Number.NaN)).toEqual({ allowed: false, reason: "INVALID_AMOUNT" });
  });

  it("records actual cost and reports what remains", () => {
    const cap = new SpendCap(500);
    cap.record(120);
    cap.record(30);
    expect(cap.spent).toBe(150);
    expect(cap.remaining).toBe(350);
    expect(cap.decide(351)).toEqual({ allowed: false, reason: "CAP_REACHED" });
  });

  it("never reports a negative remaining amount", () => {
    const cap = new SpendCap(100, 100);
    expect(cap.remaining).toBe(0);
  });

  it("resets spend at the start of a new month and keeps the cap", () => {
    const cap = new SpendCap(500);
    cap.record(500);
    expect(cap.decide(1)).toEqual({ allowed: false, reason: "CAP_REACHED" });
    cap.startNewMonth();
    expect(cap.spent).toBe(0);
    expect(cap.decide(500)).toEqual({ allowed: true });
  });

  it("rejects an invalid cap, an invalid starting spend, or an invalid recorded cost", () => {
    expect(() => new SpendCap(-1)).toThrow(RangeError);
    expect(() => new SpendCap(500.5)).toThrow(RangeError);
    expect(() => new SpendCap(500, -1)).toThrow(RangeError);
    expect(() => {
      new SpendCap(500).record(Number.POSITIVE_INFINITY);
    }).toThrow(RangeError);
  });
});
