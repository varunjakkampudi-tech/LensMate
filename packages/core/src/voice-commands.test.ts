import {
  IDLE_STATE,
  TRANSLATION_START_ANNOUNCEMENT,
  listeningSessionOf,
  onVoiceCommand,
  type GlassesState,
  type VoiceCommand,
} from "./glasses-state.js";

const COMMANDS: readonly VoiceCommand[] = [
  "START_TRANSLATION",
  "STOP_TRANSLATION",
  "START_CAPTIONS",
  "STOP_CAPTIONS",
];

const SPEAKING_IDLE: GlassesState = { mode: "IDLE", speaking: true };
const PTT: GlassesState = { mode: "PUSH_TO_TALK", speaking: false };
const SPEAKING_PTT: GlassesState = { mode: "PUSH_TO_TALK", speaking: true };
const TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: false };
const SPEAKING_TRANSLATION: GlassesState = { mode: "TRANSLATION", speaking: true };
const CAPTION: GlassesState = { mode: "CAPTION", speaking: false };
const CUTOFF: GlassesState = { mode: "CUTOFF", speaking: false };

/** Expected next mode and whether the command is accepted, for every state and command. */
const EXPECTED: ReadonlyArray<readonly [string, GlassesState, VoiceCommand, boolean, string]> = [
  ["idle", IDLE_STATE, "START_TRANSLATION", false, "IDLE"],
  ["idle", IDLE_STATE, "START_CAPTIONS", false, "IDLE"],
  ["idle", IDLE_STATE, "STOP_TRANSLATION", false, "IDLE"],
  ["idle", IDLE_STATE, "STOP_CAPTIONS", false, "IDLE"],
  ["speaking idle", SPEAKING_IDLE, "START_TRANSLATION", false, "IDLE"],
  ["push-to-talk", PTT, "START_TRANSLATION", true, "TRANSLATION"],
  ["push-to-talk", PTT, "START_CAPTIONS", true, "CAPTION"],
  ["push-to-talk", PTT, "STOP_TRANSLATION", false, "PUSH_TO_TALK"],
  ["push-to-talk", PTT, "STOP_CAPTIONS", false, "PUSH_TO_TALK"],
  ["speaking push-to-talk", SPEAKING_PTT, "START_TRANSLATION", true, "TRANSLATION"],
  ["translation", TRANSLATION, "START_TRANSLATION", false, "TRANSLATION"],
  ["translation", TRANSLATION, "START_CAPTIONS", true, "CAPTION"],
  ["translation", TRANSLATION, "STOP_TRANSLATION", true, "IDLE"],
  ["translation", TRANSLATION, "STOP_CAPTIONS", false, "TRANSLATION"],
  ["speaking translation", SPEAKING_TRANSLATION, "STOP_TRANSLATION", true, "IDLE"],
  ["caption", CAPTION, "START_CAPTIONS", false, "CAPTION"],
  ["caption", CAPTION, "START_TRANSLATION", true, "TRANSLATION"],
  ["caption", CAPTION, "STOP_CAPTIONS", true, "IDLE"],
  ["caption", CAPTION, "STOP_TRANSLATION", false, "CAPTION"],
  ["cutoff", CUTOFF, "START_TRANSLATION", false, "CUTOFF"],
  ["cutoff", CUTOFF, "STOP_CAPTIONS", false, "CUTOFF"],
];

describe("onVoiceCommand", () => {
  it.each(EXPECTED)("%s + %s -> accepted %s, mode %s", (_name, state, command, accepted, mode) => {
    const result = onVoiceCommand(state, command);
    expect(result.accepted).toBe(accepted);
    expect(result.state.mode).toBe(mode);
  });

  it("keeps the speaking flag through a voice start and a voice stop", () => {
    const started = onVoiceCommand(SPEAKING_PTT, "START_TRANSLATION");
    expect(started.state.speaking).toBe(true);
    const stopped = onVoiceCommand(SPEAKING_TRANSLATION, "STOP_TRANSLATION");
    expect(stopped.state).toEqual({ mode: "IDLE", speaking: true });
  });

  it("announces a translation start from a hold, and only a translation start", () => {
    expect(onVoiceCommand(PTT, "START_TRANSLATION").announcement).toBe(
      TRANSLATION_START_ANNOUNCEMENT,
    );
    expect(onVoiceCommand(CAPTION, "START_TRANSLATION").announcement).toBe(
      TRANSLATION_START_ANNOUNCEMENT,
    );
    expect(onVoiceCommand(PTT, "START_CAPTIONS").announcement).toBeNull();
    expect(onVoiceCommand(TRANSLATION, "STOP_TRANSLATION").announcement).toBeNull();
  });

  it("returns the same state object for a refused command", () => {
    for (const command of COMMANDS) {
      const result = onVoiceCommand(IDLE_STATE, command);
      expect(result.state).toBe(IDLE_STATE);
      expect(result.announcement).toBeNull();
    }
  });

  it("never accepts a voice command from cutoff, whatever the command", () => {
    for (const command of COMMANDS) {
      expect(onVoiceCommand(CUTOFF, command).accepted).toBe(false);
    }
  });
});

describe("listeningSessionOf", () => {
  it("names the translation and caption sessions, and nothing else", () => {
    expect(listeningSessionOf(TRANSLATION)).toBe("TRANSLATION");
    expect(listeningSessionOf(CAPTION)).toBe("CAPTION");
    expect(listeningSessionOf(PTT)).toBeNull();
    expect(listeningSessionOf(IDLE_STATE)).toBeNull();
    expect(listeningSessionOf(CUTOFF)).toBeNull();
  });
});
