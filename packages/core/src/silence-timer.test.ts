import { IDLE_STATE, SILENCE_TIMEOUT_MS, type GlassesState } from "./glasses-state.js";
import {
  checkSilenceTimer,
  recordSpeech,
  silenceRemainingMs,
  silentForMs,
  startSilenceTimer,
} from "./silence-timer.js";

const TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: false };
const CAPTION: GlassesState = { mode: "CAPTION", speaking: false };
const PTT: GlassesState = { mode: "PUSH_TO_TALK", speaking: false };

describe("silence limit boundary", () => {
  it("is 120000 ms (two minutes, TARGET)", () => {
    expect(SILENCE_TIMEOUT_MS).toBe(120_000);
  });

  it("does not stop a translation session at 119,999 ms of silence", () => {
    const timer = startSilenceTimer(0);
    const check = checkSilenceTimer(TRANSLATION, timer, 119_999);
    expect(check.endedSession).toBeNull();
    expect(check.state).toBe(TRANSLATION);
  });

  it("stops a translation session at exactly 120,000 ms of silence", () => {
    const timer = startSilenceTimer(0);
    const check = checkSilenceTimer(TRANSLATION, timer, 120_000);
    expect(check.endedSession).toBe("TRANSLATION");
    expect(check.state).toEqual(IDLE_STATE);
  });

  it("stops a caption session at the limit, and reports it as a caption session", () => {
    const check = checkSilenceTimer(CAPTION, startSilenceTimer(0), 120_000);
    expect(check.endedSession).toBe("CAPTION");
    expect(check.state).toEqual(IDLE_STATE);
  });

  it("keeps the speaking flag when the session ends by silence", () => {
    const speaking: GlassesState = { mode: "TRANSLATION", speaking: true };
    const check = checkSilenceTimer(speaking, startSilenceTimer(0), 120_000);
    expect(check.state).toEqual({ mode: "IDLE", speaking: true });
  });

  it("never ends push-to-talk or idle by silence, however long it lasts", () => {
    for (const state of [PTT, IDLE_STATE]) {
      const check = checkSilenceTimer(state, startSilenceTimer(0), 10 * SILENCE_TIMEOUT_MS);
      expect(check.endedSession).toBeNull();
      expect(check.state).toBe(state);
    }
  });
});

describe("reset on speech", () => {
  it("restarts the count from the moment speech is heard", () => {
    const timer = recordSpeech(100_000);
    expect(silentForMs(timer, 219_999)).toBe(119_999);
    expect(checkSilenceTimer(TRANSLATION, timer, 219_999).endedSession).toBeNull();
    expect(checkSilenceTimer(TRANSLATION, timer, 220_000).endedSession).toBe("TRANSLATION");
  });

  it("keeps a session alive when speech arrives just before the limit", () => {
    let timer = recordSpeech(119_000);
    expect(checkSilenceTimer(TRANSLATION, timer, 120_000).endedSession).toBeNull();
    timer = recordSpeech(200_000);
    expect(checkSilenceTimer(TRANSLATION, timer, 319_999).endedSession).toBeNull();
  });
});

describe("silence measurements", () => {
  it("counts the silence from the start of the session when no speech was heard", () => {
    expect(silentForMs(startSilenceTimer(5_000), 9_000)).toBe(4_000);
  });

  it("treats a clock that reads earlier than the last speech as zero silence", () => {
    expect(silentForMs(recordSpeech(10_000), 4_000)).toBe(0);
  });

  it("gives the remaining time for the countdown, never below zero", () => {
    const timer = startSilenceTimer(0);
    expect(silenceRemainingMs(timer, 0)).toBe(120_000);
    expect(silenceRemainingMs(timer, 119_999)).toBe(1);
    expect(silenceRemainingMs(timer, 120_000)).toBe(0);
    expect(silenceRemainingMs(timer, 500_000)).toBe(0);
  });
});
