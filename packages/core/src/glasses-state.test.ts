import {
  IDLE_STATE,
  SILENCE_TIMEOUT_MS,
  TRANSLATION_START_ANNOUNCEMENT,
  applyCutoff,
  applySilenceTimeout,
  captureSessionForEffect,
  isCapturing,
  onGesture,
  speechEnded,
  speechStarted,
  startListeningSession,
  stopListeningSession,
} from "./glasses-state.js";
import type { Gesture, GlassesEffect, GlassesMode, GlassesState } from "./glasses-state.js";

const GESTURES: readonly Gesture[] = ["SINGLE_TAP", "DOUBLE_TAP", "HOLD", "RELEASE", "PRESS"];

/** Gestures that are not built (triple tap is companion, five presses is emergency). */
const OUT_OF_SCOPE_GESTURES = ["TRIPLE_TAP", "FIVE_PRESS"] as unknown as readonly Gesture[];

const PTT: GlassesState = { mode: "PUSH_TO_TALK", speaking: false };
const TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: false };
const CAPTION: GlassesState = { mode: "CAPTION", speaking: false };
const CUTOFF: GlassesState = { mode: "CUTOFF", speaking: false };
const SPEAKING_IDLE: GlassesState = { mode: "IDLE", speaking: true };
const SPEAKING_TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: true };
const SPEAKING_PTT: GlassesState = { mode: "PUSH_TO_TALK", speaking: true };

type Row = readonly [string, GlassesState, Gesture, GlassesEffect, GlassesMode];

/** Every (state, gesture) pair with its expected effect and next mode. */
const TABLE: readonly Row[] = [
  ["idle", IDLE_STATE, "SINGLE_TAP", "CAPTURE_PHOTO", "IDLE"],
  ["idle", IDLE_STATE, "DOUBLE_TAP", "CAPTURE_VISUAL_QUESTION", "IDLE"],
  ["idle", IDLE_STATE, "HOLD", "START_PUSH_TO_TALK", "PUSH_TO_TALK"],
  ["idle", IDLE_STATE, "RELEASE", "NONE", "IDLE"],
  ["idle", IDLE_STATE, "PRESS", "NONE", "IDLE"],
  ["push-to-talk", PTT, "SINGLE_TAP", "NONE", "PUSH_TO_TALK"],
  ["push-to-talk", PTT, "DOUBLE_TAP", "NONE", "PUSH_TO_TALK"],
  ["push-to-talk", PTT, "HOLD", "NONE", "PUSH_TO_TALK"],
  ["push-to-talk", PTT, "RELEASE", "SEND_QUESTION", "IDLE"],
  ["push-to-talk", PTT, "PRESS", "CANCEL_QUESTION", "IDLE"],
  ["translation", TRANSLATION, "SINGLE_TAP", "NONE", "TRANSLATION"],
  ["translation", TRANSLATION, "DOUBLE_TAP", "NONE", "TRANSLATION"],
  ["translation", TRANSLATION, "HOLD", "NONE", "TRANSLATION"],
  ["translation", TRANSLATION, "RELEASE", "NONE", "TRANSLATION"],
  ["translation", TRANSLATION, "PRESS", "NONE", "TRANSLATION"],
  ["caption", CAPTION, "SINGLE_TAP", "NONE", "CAPTION"],
  ["caption", CAPTION, "DOUBLE_TAP", "NONE", "CAPTION"],
  ["caption", CAPTION, "HOLD", "NONE", "CAPTION"],
  ["caption", CAPTION, "RELEASE", "NONE", "CAPTION"],
  ["caption", CAPTION, "PRESS", "NONE", "CAPTION"],
  ["cutoff", CUTOFF, "SINGLE_TAP", "NONE", "CUTOFF"],
  ["cutoff", CUTOFF, "DOUBLE_TAP", "NONE", "CUTOFF"],
  ["cutoff", CUTOFF, "HOLD", "NONE", "CUTOFF"],
  ["cutoff", CUTOFF, "RELEASE", "NONE", "CUTOFF"],
  ["cutoff", CUTOFF, "PRESS", "NONE", "CUTOFF"],
  ["speaking idle", SPEAKING_IDLE, "SINGLE_TAP", "NONE", "IDLE"],
  ["speaking idle", SPEAKING_IDLE, "DOUBLE_TAP", "NONE", "IDLE"],
  ["speaking idle", SPEAKING_IDLE, "HOLD", "NONE", "IDLE"],
  ["speaking idle", SPEAKING_IDLE, "RELEASE", "NONE", "IDLE"],
  ["speaking idle", SPEAKING_IDLE, "PRESS", "STOP_SPEECH", "IDLE"],
  ["speaking translation", SPEAKING_TRANSLATION, "SINGLE_TAP", "NONE", "TRANSLATION"],
  ["speaking translation", SPEAKING_TRANSLATION, "DOUBLE_TAP", "NONE", "TRANSLATION"],
  ["speaking translation", SPEAKING_TRANSLATION, "HOLD", "NONE", "TRANSLATION"],
  ["speaking translation", SPEAKING_TRANSLATION, "RELEASE", "NONE", "TRANSLATION"],
  ["speaking translation", SPEAKING_TRANSLATION, "PRESS", "STOP_SPEECH", "TRANSLATION"],
  ["speaking push-to-talk", SPEAKING_PTT, "SINGLE_TAP", "NONE", "PUSH_TO_TALK"],
  ["speaking push-to-talk", SPEAKING_PTT, "RELEASE", "NONE", "PUSH_TO_TALK"],
  ["speaking push-to-talk", SPEAKING_PTT, "PRESS", "STOP_SPEECH", "PUSH_TO_TALK"],
];

describe("onGesture precedence table", () => {
  it.each(TABLE)("%s + %s -> %s, mode %s", (_name, state, gesture, effect, mode) => {
    const result = onGesture(state, gesture);
    expect(result.effect).toBe(effect);
    expect(result.state.mode).toBe(mode);
  });

  it("lists every gesture once for each named state", () => {
    const names = ["idle", "push-to-talk", "translation", "caption", "cutoff"];
    for (const name of names) {
      for (const gesture of GESTURES) {
        const rows = TABLE.filter(
          ([rowName, , rowGesture]) => rowName === name && rowGesture === gesture,
        );
        expect(rows).toHaveLength(1);
      }
    }
  });

  it("starts capture only from idle with no speech, never during a listening session or cutoff", () => {
    const captureEffects: readonly GlassesEffect[] = ["CAPTURE_PHOTO", "CAPTURE_VISUAL_QUESTION"];
    for (const [, state, gesture, effect] of TABLE) {
      if (captureEffects.includes(effect)) {
        expect(state.mode).toBe("IDLE");
        expect(state.speaking).toBe(false);
        expect(["SINGLE_TAP", "DOUBLE_TAP"]).toContain(gesture);
      }
    }
  });

  it("never starts push-to-talk from a state other than idle", () => {
    for (const [, state, , effect] of TABLE) {
      if (effect === "START_PUSH_TO_TALK") {
        expect(state.mode).toBe("IDLE");
      }
    }
  });

  it("push-to-talk never captures a photo, whatever the gesture", () => {
    for (const gesture of GESTURES) {
      const effect = onGesture(PTT, gesture).effect;
      expect(effect).not.toBe("CAPTURE_PHOTO");
      expect(effect).not.toBe("CAPTURE_VISUAL_QUESTION");
    }
  });

  it("ignores taps during a translation or caption session, and during cutoff", () => {
    for (const state of [TRANSLATION, CAPTION, CUTOFF]) {
      expect(onGesture(state, "SINGLE_TAP")).toEqual({ state, effect: "NONE" });
      expect(onGesture(state, "DOUBLE_TAP")).toEqual({ state, effect: "NONE" });
    }
  });

  it("ignores a state mode it does not know, so an unexpected value never claims a gesture", () => {
    const unknown = { mode: "COMPANION", speaking: false } as unknown as GlassesState;
    expect(onGesture(unknown, "SINGLE_TAP")).toEqual({ state: unknown, effect: "NONE" });
  });

  it("ignores gestures that are not built, in every state, so they never start companion, walk or emergency", () => {
    const states = [
      IDLE_STATE,
      PTT,
      TRANSLATION,
      CAPTION,
      CUTOFF,
      SPEAKING_IDLE,
      SPEAKING_TRANSLATION,
    ];
    for (const state of states) {
      for (const gesture of OUT_OF_SCOPE_GESTURES) {
        expect(onGesture(state, gesture)).toEqual({ state, effect: "NONE" });
      }
    }
  });
});

describe("speech and the press that stops it", () => {
  it("a press during speech stops speech and does nothing else", () => {
    expect(onGesture(SPEAKING_IDLE, "PRESS")).toEqual({ state: IDLE_STATE, effect: "STOP_SPEECH" });
  });

  it("taps work again after speech ends on its own", () => {
    const ended = speechEnded(speechStarted(IDLE_STATE));
    expect(onGesture(ended, "SINGLE_TAP").effect).toBe("CAPTURE_PHOTO");
  });

  it("speechEnded clears speaking and leaves other states alone", () => {
    expect(speechEnded(SPEAKING_TRANSLATION)).toEqual(TRANSLATION);
    expect(speechEnded(IDLE_STATE)).toEqual(IDLE_STATE);
    expect(speechEnded(CUTOFF)).toEqual(CUTOFF);
  });
});

describe("listening sessions from the phone app or voice", () => {
  it("starts translation and caption only from idle", () => {
    expect(startListeningSession(IDLE_STATE, "TRANSLATION")).toEqual({
      state: TRANSLATION,
      accepted: true,
      announcement: TRANSLATION_START_ANNOUNCEMENT,
    });
    expect(startListeningSession(IDLE_STATE, "CAPTION")).toEqual({
      state: CAPTION,
      accepted: true,
      announcement: null,
    });
  });

  it("announces translation at every start and never announces a refused start", () => {
    expect(TRANSLATION_START_ANNOUNCEMENT).toBe(
      "Translation on. This conversation is being listened to for translation",
    );
    expect(startListeningSession(SPEAKING_IDLE, "TRANSLATION").announcement).toBe(
      TRANSLATION_START_ANNOUNCEMENT,
    );
    for (const state of [PTT, CUTOFF, TRANSLATION, CAPTION]) {
      expect(startListeningSession(state, "TRANSLATION")).toEqual({
        state,
        accepted: false,
        announcement: null,
      });
    }
  });

  it("refuses to start a listening session while push-to-talk, cutoff or another session is active", () => {
    for (const state of [PTT, CUTOFF, TRANSLATION, CAPTION]) {
      expect(startListeningSession(state, "TRANSLATION").accepted).toBe(false);
      expect(startListeningSession(state, "CAPTION").accepted).toBe(false);
    }
  });

  it("keeps speech going when a session starts or stops, so the press is still needed to stop it", () => {
    expect(startListeningSession(SPEAKING_IDLE, "TRANSLATION").state).toEqual(SPEAKING_TRANSLATION);
    expect(stopListeningSession(SPEAKING_TRANSLATION)).toEqual(SPEAKING_IDLE);
  });

  it("stops translation and caption, and leaves other states alone", () => {
    expect(stopListeningSession(TRANSLATION)).toEqual(IDLE_STATE);
    expect(stopListeningSession(CAPTION)).toEqual(IDLE_STATE);
    expect(stopListeningSession(PTT)).toEqual(PTT);
  });
});

describe("silence timeout for translation and caption", () => {
  it("is two minutes", () => {
    expect(SILENCE_TIMEOUT_MS).toBe(120_000);
  });

  it("keeps a translation or caption session just before two minutes of silence", () => {
    expect(applySilenceTimeout(TRANSLATION, SILENCE_TIMEOUT_MS - 1)).toEqual(TRANSLATION);
    expect(applySilenceTimeout(CAPTION, SILENCE_TIMEOUT_MS - 1)).toEqual(CAPTION);
  });

  it("stops translation and caption at exactly two minutes of silence", () => {
    expect(applySilenceTimeout(TRANSLATION, SILENCE_TIMEOUT_MS)).toEqual(IDLE_STATE);
    expect(applySilenceTimeout(CAPTION, SILENCE_TIMEOUT_MS + 5_000)).toEqual(IDLE_STATE);
  });

  it("keeps the speech flag when silence stops the session", () => {
    expect(applySilenceTimeout(SPEAKING_TRANSLATION, SILENCE_TIMEOUT_MS)).toEqual(SPEAKING_IDLE);
  });

  it("never ends push-to-talk, idle or cutoff on silence", () => {
    for (const state of [PTT, IDLE_STATE, CUTOFF]) {
      expect(applySilenceTimeout(state, SILENCE_TIMEOUT_MS * 10)).toEqual(state);
    }
  });
});

describe("cutoff and speech", () => {
  it("applies cutoff and clears speaking", () => {
    expect(applyCutoff()).toEqual(CUTOFF);
  });

  it("does not start speaking during cutoff, and starts it otherwise", () => {
    expect(speechStarted(CUTOFF)).toEqual(CUTOFF);
    expect(speechStarted(IDLE_STATE)).toEqual(SPEAKING_IDLE);
  });
});

describe("isCapturing and capture sessions", () => {
  it("is true for push-to-talk, translation and caption, and false otherwise", () => {
    expect(isCapturing(PTT)).toBe(true);
    expect(isCapturing(TRANSLATION)).toBe(true);
    expect(isCapturing(CAPTION)).toBe(true);
    expect(isCapturing(IDLE_STATE)).toBe(false);
    expect(isCapturing(CUTOFF)).toBe(false);
  });

  it("maps every capture effect to an indicator session, so each capture runs with the indicator on", () => {
    expect(captureSessionForEffect("CAPTURE_PHOTO")).toBe("PHOTO_QUESTION");
    expect(captureSessionForEffect("CAPTURE_VISUAL_QUESTION")).toBe("PHOTO_QUESTION");
    expect(captureSessionForEffect("START_PUSH_TO_TALK")).toBe("PUSH_TO_TALK");
  });

  it("opens no indicator session for effects that do not capture", () => {
    for (const effect of [
      "NONE",
      "SEND_QUESTION",
      "CANCEL_QUESTION",
      "STOP_SPEECH",
    ] as const satisfies readonly GlassesEffect[]) {
      expect(captureSessionForEffect(effect)).toBeNull();
    }
  });

  it("every gesture effect that captures is covered by the indicator mapping", () => {
    for (const [, state, gesture] of TABLE) {
      const { effect } = onGesture(state, gesture);
      const captures =
        effect === "CAPTURE_PHOTO" ||
        effect === "CAPTURE_VISUAL_QUESTION" ||
        effect === "START_PUSH_TO_TALK";
      expect(captureSessionForEffect(effect) !== null).toBe(captures);
    }
  });
});
