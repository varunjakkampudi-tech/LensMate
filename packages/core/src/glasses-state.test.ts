import {
  IDLE_STATE,
  applyCutoff,
  isCapturing,
  onGesture,
  speechStarted,
  startListeningSession,
  stopListeningSession,
} from "./glasses-state.js";
import type { Gesture, GlassesEffect, GlassesMode, GlassesState } from "./glasses-state.js";

const GESTURES: readonly Gesture[] = ["SINGLE_TAP", "DOUBLE_TAP", "HOLD", "RELEASE", "PRESS"];

const PTT: GlassesState = { mode: "PUSH_TO_TALK", speaking: false };
const TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: false };
const CAPTION: GlassesState = { mode: "CAPTION", speaking: false };
const CUTOFF: GlassesState = { mode: "CUTOFF", speaking: false };
const SPEAKING_IDLE: GlassesState = { mode: "IDLE", speaking: true };
const SPEAKING_TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: true };

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
  ["speaking translation", SPEAKING_TRANSLATION, "PRESS", "STOP_SPEECH", "TRANSLATION"],
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
});

describe("listening sessions from the phone app or voice", () => {
  it("starts translation and caption only from idle", () => {
    expect(startListeningSession(IDLE_STATE, "TRANSLATION")).toEqual({
      state: TRANSLATION,
      accepted: true,
    });
    expect(startListeningSession(IDLE_STATE, "CAPTION")).toEqual({
      state: CAPTION,
      accepted: true,
    });
  });

  it("refuses to start a listening session while push-to-talk, cutoff or another session is active", () => {
    for (const state of [PTT, CUTOFF, TRANSLATION, CAPTION]) {
      expect(startListeningSession(state, "TRANSLATION").accepted).toBe(false);
    }
  });

  it("stops translation and caption, and leaves other states alone", () => {
    expect(stopListeningSession(TRANSLATION)).toEqual(IDLE_STATE);
    expect(stopListeningSession(CAPTION)).toEqual(IDLE_STATE);
    expect(stopListeningSession(PTT)).toEqual(PTT);
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

describe("isCapturing", () => {
  it("is true for push-to-talk, translation and caption, and false otherwise", () => {
    expect(isCapturing(PTT)).toBe(true);
    expect(isCapturing(TRANSLATION)).toBe(true);
    expect(isCapturing(CAPTION)).toBe(true);
    expect(isCapturing(IDLE_STATE)).toBe(false);
    expect(isCapturing(CUTOFF)).toBe(false);
  });
});
