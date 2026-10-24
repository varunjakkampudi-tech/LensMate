import {
  SILENCE_TIMEOUT_MS,
  TRANSLATION_START_ANNOUNCEMENT,
  recordSpeech,
  startSilenceTimer,
} from "@lensmate/core";
import type { SimulatorEvent } from "@lensmate/simulator";
import {
  INITIAL_TRANSLATION_MODEL,
  ackErrorText,
  formatCountdown,
  indicatorText,
  reduceTranslation,
  type TranslationSessionModel,
} from "./translation-session-model";
import { STRINGS } from "./strings";

const T = STRINGS.translationSession;

const TRANSLATION_ON = {
  type: "INDICATOR",
  on: true,
  reason: "INDICATOR_REASON_TRANSLATION",
} as const;
const CAPTION_ON = { type: "INDICATOR", on: true, reason: "INDICATOR_REASON_CAPTION" } as const;
const OFF = { type: "INDICATOR", on: false, reason: "INDICATOR_REASON_IDLE" } as const;

function event(value: SimulatorEvent) {
  return { type: "EVENT", event: value } as const;
}

function run(actions: readonly Parameters<typeof reduceTranslation>[1][]): TranslationSessionModel {
  return actions.reduce(reduceTranslation, INITIAL_TRANSLATION_MODEL);
}

describe("reduceTranslation: the indicator", () => {
  it("shows a translation session when the indicator reports translation", () => {
    const model = run([TRANSLATION_ON]);
    expect(model.session).toBe("TRANSLATION");
    expect(model.indicatorOn).toBe(true);
  });

  it("shows a caption session when the indicator reports captions", () => {
    expect(run([CAPTION_ON]).session).toBe("CAPTION");
  });

  it("shows no listening session for push-to-talk or a photo, but keeps the indicator on", () => {
    const model = run([{ type: "INDICATOR", on: true, reason: "INDICATOR_REASON_PUSH_TO_TALK" }]);
    expect(model.session).toBeNull();
    expect(model.indicatorOn).toBe(true);
    expect(model.indicatorReason).toBe("INDICATOR_REASON_PUSH_TO_TALK");
  });

  it("clears the session and the countdown when the indicator goes off", () => {
    const model = run([
      TRANSLATION_ON,
      event({ kind: "SESSION_STARTED", session: "TRANSLATION", source: "APP", atMs: 0 }),
      OFF,
    ]);
    expect(model.session).toBeNull();
    expect(model.indicatorOn).toBe(false);
    expect(model.silence).toBeNull();
  });
});

describe("reduceTranslation: session events", () => {
  it("starts the silence timer, clears old captions and the ended reason when a session starts", () => {
    const withCaption = run([
      TRANSLATION_ON,
      event({ kind: "CAPTION_TEXT", text: "old" }),
      event({ kind: "SESSION_ENDED", session: "TRANSLATION", cause: "APP", atMs: 1 }),
    ]);
    const restarted = reduceTranslation(
      withCaption,
      event({ kind: "SESSION_STARTED", session: "TRANSLATION", source: "APP", atMs: 500 }),
    );
    expect(restarted.silence).toEqual(startSilenceTimer(500));
    expect(restarted.captions).toEqual([]);
    expect(restarted.endedBy).toBeNull();
  });

  it("records the announcement it is given", () => {
    const model = run([event({ kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT })]);
    expect(model.announcement).toBe(TRANSLATION_START_ANNOUNCEMENT);
  });

  it("resets the silence timer on speech only while a session runs", () => {
    const running = run([
      event({ kind: "SESSION_STARTED", session: "TRANSLATION", source: "APP", atMs: 0 }),
    ]);
    const heard = reduceTranslation(running, event({ kind: "SPEECH_ACTIVITY", atMs: 40_000 }));
    expect(heard.silence).toEqual(recordSpeech(40_000));
    const idle = run([event({ kind: "SPEECH_ACTIVITY", atMs: 40_000 })]);
    expect(idle.silence).toBeNull();
  });

  it("keeps captions only while a session is running", () => {
    expect(run([event({ kind: "CAPTION_TEXT", text: "unheard" })]).captions).toEqual([]);
    const captioned = run([CAPTION_ON, event({ kind: "CAPTION_TEXT", text: "Hello" })]);
    expect(captioned.captions).toEqual(["Hello"]);
  });

  it("records why the session ended and stops the countdown", () => {
    const model = run([
      TRANSLATION_ON,
      event({ kind: "SESSION_STARTED", session: "TRANSLATION", source: "APP", atMs: 0 }),
      event({
        kind: "SESSION_ENDED",
        session: "TRANSLATION",
        cause: "SILENCE",
        atMs: SILENCE_TIMEOUT_MS,
      }),
    ]);
    expect(model.endedBy).toBe("SILENCE");
    expect(model.silence).toBeNull();
  });

  it("ignores events it does not show", () => {
    const before = run([TRANSLATION_ON]);
    expect(
      reduceTranslation(before, event({ kind: "BUTTON", action: "BUTTON_ACTION_SINGLE_TAP" })),
    ).toBe(before);
    expect(
      reduceTranslation(
        before,
        event({ kind: "VOICE_COMMAND", phrase: "x", command: null, accepted: false }),
      ),
    ).toBe(before);
  });
});

describe("formatCountdown", () => {
  it.each([
    [120_000, "2:00"],
    [119_001, "2:00"],
    [119_000, "1:59"],
    [60_000, "1:00"],
    [59_000, "0:59"],
    [1_000, "0:01"],
    [1, "0:01"],
    [0, "0:00"],
  ])("%i ms reads as %s", (remaining, text) => {
    expect(formatCountdown(remaining)).toBe(text);
  });
});

describe("ackErrorText", () => {
  it("explains a busy refusal, a malformed refusal, and any other error", () => {
    expect(ackErrorText("ERROR_CODE_CAPTURE_ACTIVE")).toBe(T.errors.busy);
    expect(ackErrorText("ERROR_CODE_MALFORMED")).toBe(T.errors.malformed);
    expect(ackErrorText("ERROR_CODE_REPLAYED")).toBe(T.errors.failed);
    expect(ackErrorText("")).toBe(T.errors.failed);
  });
});

describe("indicatorText", () => {
  it("says the indicator is off in words", () => {
    expect(indicatorText(INITIAL_TRANSLATION_MODEL)).toBe(T.indicatorOff);
  });

  it("names the reason in words when the indicator is on", () => {
    expect(indicatorText(run([TRANSLATION_ON]))).toBe(T.indicatorOn("translation"));
    expect(indicatorText(run([CAPTION_ON]))).toBe(T.indicatorOn("captions"));
  });

  it("falls back to a generic word for a reason it does not name", () => {
    const model = run([{ type: "INDICATOR", on: true, reason: "INDICATOR_REASON_UNKNOWN" }]);
    expect(indicatorText(model)).toBe(T.indicatorOn("capture"));
  });
});
