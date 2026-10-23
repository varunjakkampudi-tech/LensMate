import {
  captureToPhoneReport,
  interruptionCriterionMet,
  interruptionReport,
  intervalMs,
  latencyCriterionMet,
  latencyTotalReport,
  type LanguageReport,
  type MeasuredAttempt,
} from "./evaluate.js";
import { LANGUAGES } from "./targets.js";

function captureTry(language: "en" | "te" | "hi" | "mixed", ms: number): MeasuredAttempt {
  return { language, completed: true, marks: { capture: 1000, phone_received: 1000 + ms } };
}

function totalTry(language: "en" | "te" | "hi" | "mixed", ms: number): MeasuredAttempt {
  return {
    language,
    completed: true,
    marks: {
      capture: 0,
      phone_received: 100,
      first_words: 200,
      first_sentence: 300,
      speech_start: ms,
    },
  };
}

function stopTry(language: "en" | "te" | "hi" | "mixed", ms: number): MeasuredAttempt {
  return { language, completed: true, marks: { stop_press: 50, speech_stopped: 50 + ms } };
}

function forLanguage(reports: readonly LanguageReport[], language: string): LanguageReport {
  const report = reports.find((item) => item.language === language);
  if (report === undefined) {
    throw new Error(`no report for ${language}`);
  }
  return report;
}

describe("intervalMs", () => {
  it("returns the elapsed milliseconds between two marks", () => {
    expect(intervalMs({ capture: 10, phone_received: 260 }, "capture", "phone_received")).toBe(250);
  });

  it("returns undefined when either mark is missing", () => {
    expect(intervalMs({ capture: 10 }, "capture", "phone_received")).toBeUndefined();
    expect(intervalMs({ phone_received: 10 }, "capture", "phone_received")).toBeUndefined();
  });

  it("throws when the later mark is earlier than the first", () => {
    expect(() =>
      intervalMs({ capture: 500, phone_received: 400 }, "capture", "phone_received"),
    ).toThrow(RangeError);
  });

  it("throws on values that are not finite numbers", () => {
    expect(() =>
      intervalMs({ capture: Number.NaN, phone_received: 1 }, "capture", "phone_received"),
    ).toThrow(RangeError);
    expect(() =>
      intervalMs({ capture: 0, phone_received: Infinity }, "capture", "phone_received"),
    ).toThrow(RangeError);
  });

  it("accepts zero-length intervals", () => {
    expect(intervalMs({ capture: 7, phone_received: 7 }, "capture", "phone_received")).toBe(0);
  });
});

describe("capture to phone budget (300 ms, at or under passes)", () => {
  it("passes at exactly 300 ms and fails at 301 ms", () => {
    const report = forLanguage(
      captureToPhoneReport([captureTry("en", 300), captureTry("en", 301)]),
      "en",
    );
    expect(report.attempts).toBe(2);
    expect(report.measured).toBe(2);
    expect(report.passes).toBe(1);
    expect(report.passPercent).toBe(50);
  });
});

describe("total short request budget (under 2500 ms, strictly)", () => {
  it("passes at 2499 ms and fails at exactly 2500 ms", () => {
    const report = forLanguage(
      latencyTotalReport([totalTry("te", 2499), totalTry("te", 2500)]),
      "te",
    );
    expect(report.passes).toBe(1);
    expect(report.passPercent).toBe(50);
  });
});

describe("interruption budget (500 ms, at or under passes)", () => {
  it("passes at exactly 500 ms and fails at 501 ms", () => {
    const report = forLanguage(interruptionReport([stopTry("hi", 500), stopTry("hi", 501)]), "hi");
    expect(report.passes).toBe(1);
    expect(report.passPercent).toBe(50);
  });
});

describe("latency acceptance (50 requests per language, at least 90 percent)", () => {
  function batch(
    passing: number,
    total: number,
    language: "en" | "te" | "hi" | "mixed",
  ): MeasuredAttempt[] {
    const tries: MeasuredAttempt[] = [];
    for (let index = 0; index < total; index += 1) {
      tries.push(totalTry(language, index < passing ? 1000 : 2600));
    }
    return tries;
  }

  it("is met at exactly 45 of 50 (90 percent)", () => {
    const report = forLanguage(latencyTotalReport(batch(45, 50, "en")), "en");
    expect(report.passPercent).toBe(90);
    expect(latencyCriterionMet(report)).toBe(true);
  });

  it("is not met at 44 of 50 (88 percent)", () => {
    const report = forLanguage(latencyTotalReport(batch(44, 50, "en")), "en");
    expect(latencyCriterionMet(report)).toBe(false);
  });

  it("is not met with fewer than 50 requests even at 100 percent", () => {
    const report = forLanguage(latencyTotalReport(batch(49, 49, "te")), "te");
    expect(report.passPercent).toBe(100);
    expect(latencyCriterionMet(report)).toBe(false);
  });

  it("does not round 89.9 percent up to 90", () => {
    // 899 of 1000 is 89.9 percent: the acceptance rule must not round it up to 90.
    const tries = [
      ...Array.from({ length: 899 }, () => totalTry("en", 1000)),
      ...Array.from({ length: 101 }, () => totalTry("en", 2600)),
    ];
    const report = forLanguage(latencyTotalReport(tries), "en");
    expect(report.passes).toBe(899);
    expect(report.passPercent).toBe(89);
    expect(latencyCriterionMet(report)).toBe(false);
  });
});

describe("interruption acceptance (95 percent)", () => {
  it("is met at exactly 19 of 20 and not met at 18 of 20", () => {
    const pass = forLanguage(
      interruptionReport([
        ...Array.from({ length: 19 }, () => stopTry("en", 100)),
        stopTry("en", 900),
      ]),
      "en",
    );
    expect(interruptionCriterionMet(pass)).toBe(true);

    const fail = forLanguage(
      interruptionReport([
        ...Array.from({ length: 18 }, () => stopTry("en", 100)),
        stopTry("en", 900),
        stopTry("en", 900),
      ]),
      "en",
    );
    expect(interruptionCriterionMet(fail)).toBe(false);
  });

  it("is not met when there are no attempts", () => {
    const report = forLanguage(interruptionReport([]), "en");
    expect(report.attempts).toBe(0);
    expect(interruptionCriterionMet(report)).toBe(false);
  });
});

describe("partial failures and invalid input", () => {
  it("counts failed tries as attempts that do not pass", () => {
    const report = forLanguage(
      latencyTotalReport([
        totalTry("en", 1000),
        { language: "en", completed: false, marks: {} },
        totalTry("en", 1200),
      ]),
      "en",
    );
    expect(report.attempts).toBe(3);
    expect(report.measured).toBe(2);
    expect(report.passes).toBe(2);
    expect(report.passPercent).toBe(66);
  });

  it("counts a try with reversed marks as an attempt that does not pass", () => {
    const reversed: MeasuredAttempt = {
      language: "mixed",
      completed: true,
      marks: { capture: 500, phone_received: 100 },
    };
    const report = forLanguage(captureToPhoneReport([captureTry("mixed", 100), reversed]), "mixed");
    expect(report.attempts).toBe(2);
    expect(report.measured).toBe(1);
    expect(report.passes).toBe(1);
  });

  it("counts a completed try with a missing mark as an attempt that does not pass", () => {
    const report = forLanguage(
      latencyTotalReport([{ language: "en", completed: true, marks: { capture: 0 } }]),
      "en",
    );
    expect(report.attempts).toBe(1);
    expect(report.measured).toBe(0);
    expect(report.passPercent).toBe(0);
  });

  it("reports every language, including languages with no attempts", () => {
    const reports = captureToPhoneReport([captureTry("en", 100)]);
    expect(reports.map((report) => report.language)).toEqual([...LANGUAGES]);
    expect(forLanguage(reports, "hi")).toEqual({
      language: "hi",
      attempts: 0,
      measured: 0,
      passes: 0,
      passPercent: 0,
    });
  });
});
