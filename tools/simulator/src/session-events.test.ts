import path from "node:path";
import {
  PROTOCOL_VERSION,
  ProtocolCodec,
  loadProtocolRoot,
  type EnvelopeMessage,
} from "@lensmate/protocol";
import {
  SILENCE_TIMEOUT_MS,
  SPEECH_STOP_TARGET_MS,
  TRANSLATION_START_ANNOUNCEMENT,
} from "@lensmate/core";
import {
  SIMULATED_MS_PER_CHARACTER,
  SIMULATED_STOP_DELAY_MS,
  VirtualGlasses,
  type SimulatorEvent,
} from "./virtual-glasses.js";

const schemaPath = path.resolve(
  __dirname,
  "../../../packages/protocol/proto/lensmate/v1/link.proto",
);

async function connected(clock: () => number = () => 0): Promise<VirtualGlasses> {
  const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)), clock);
  await glasses.connect();
  return glasses;
}

function appSession(type: string, phase: string, sequence: number): EnvelopeMessage {
  return { protocolVersion: PROTOCOL_VERSION, sequence, session: { type, phase } };
}

const ON_TRANSLATION = { kind: "INDICATOR", on: true, reason: "INDICATOR_REASON_TRANSLATION" };
const OFF = { kind: "INDICATOR", on: false, reason: "INDICATOR_REASON_IDLE" };

describe("simulator event log: full sequences", () => {
  it("logs the app start as session, announcement, then indicator on", async () => {
    let now = 1_000;
    const glasses = await connected(() => now);
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.eventLog).toEqual([
      { kind: "SESSION_STARTED", session: "TRANSLATION", source: "APP", atMs: 1_000 },
      { kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT },
      ON_TRANSLATION,
    ]);

    now = 5_000;
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ENDED", 2));
    expect(glasses.eventLog.slice(3)).toEqual([
      { kind: "SESSION_ENDED", session: "TRANSLATION", cause: "APP", atMs: 5_000 },
      OFF,
    ]);
  });

  it("starts translation by voice from a hold, switches the indicator reason, and ignores the release", async () => {
    const glasses = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.voiceCommand("start translation");
    expect(glasses.eventLog).toEqual([
      { kind: "BUTTON", action: "BUTTON_ACTION_HOLD" },
      { kind: "INDICATOR", on: true, reason: "INDICATOR_REASON_PUSH_TO_TALK" },
      {
        kind: "VOICE_COMMAND",
        phrase: "start translation",
        command: "START_TRANSLATION",
        accepted: true,
      },
      { kind: "SESSION_STARTED", session: "TRANSLATION", source: "VOICE", atMs: 0 },
      { kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT },
      ON_TRANSLATION,
    ]);
    glasses.pressButton("BUTTON_ACTION_RELEASE");
    expect(glasses.gestureEffects).toEqual(["START_PUSH_TO_TALK"]);
    expect(glasses.indicatorOn).toBe(true);
  });

  it("stops translation by voice and turns the indicator off", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.voiceCommand("stop translation");
    expect(glasses.eventLog.slice(3)).toEqual([
      {
        kind: "VOICE_COMMAND",
        phrase: "stop translation",
        command: "STOP_TRANSLATION",
        accepted: true,
      },
      { kind: "SESSION_ENDED", session: "TRANSLATION", cause: "VOICE", atMs: 0 },
      OFF,
    ]);
    expect(glasses.indicatorOn).toBe(false);
  });

  it("switches from captions to translation by voice without the indicator dropping", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 1));
    const before = glasses.eventLog.length;
    glasses.voiceCommand("start translation");
    expect(glasses.eventLog.slice(before)).toEqual([
      {
        kind: "VOICE_COMMAND",
        phrase: "start translation",
        command: "START_TRANSLATION",
        accepted: true,
      },
      { kind: "SESSION_ENDED", session: "CAPTION", cause: "VOICE", atMs: 0 },
      { kind: "SESSION_STARTED", session: "TRANSLATION", source: "VOICE", atMs: 0 },
      { kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT },
      ON_TRANSLATION,
    ]);
    expect(glasses.eventLog.some((event) => isIndicatorOff(event))).toBe(false);
  });

  it("refuses a voice start from idle, because nothing user-started is listening", async () => {
    const glasses = await connected();
    glasses.voiceCommand("start translation");
    glasses.voiceCommand("start captions");
    expect(glasses.eventLog).toEqual([
      {
        kind: "VOICE_COMMAND",
        phrase: "start translation",
        command: "START_TRANSLATION",
        accepted: false,
      },
      {
        kind: "VOICE_COMMAND",
        phrase: "start captions",
        command: "START_CAPTIONS",
        accepted: false,
      },
    ]);
    expect(glasses.indicatorOn).toBe(false);
    expect(glasses.spoken).toEqual([]);
  });

  it("refuses a voice stop that names a session which is not running", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.voiceCommand("stop captions");
    expect(glasses.indicatorOn).toBe(true);
    expect(glasses.eventLog.at(-1)).toEqual({
      kind: "VOICE_COMMAND",
      phrase: "stop captions",
      command: "STOP_CAPTIONS",
      accepted: false,
    });
  });

  it("records an unrecognised phrase as not accepted and changes nothing", async () => {
    const glasses = await connected();
    glasses.voiceCommand("  Please translate that  ");
    expect(glasses.eventLog).toEqual([
      {
        kind: "VOICE_COMMAND",
        phrase: "  Please translate that  ",
        command: null,
        accepted: false,
      },
    ]);
  });

  it("normalises the case and spacing of a recognised phrase", async () => {
    const glasses = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.voiceCommand("  Start Translation ");
    expect(glasses.indicatorOn).toBe(true);
    expect(glasses.eventLog.at(-1)).toEqual(ON_TRANSLATION);
  });

  it("refuses a voice start while cut off, and refuses everything voice-related", async () => {
    const glasses = await connected();
    glasses.cutOff();
    glasses.voiceCommand("start translation");
    expect(glasses.eventLog.at(-1)).toEqual({
      kind: "VOICE_COMMAND",
      phrase: "start translation",
      command: "START_TRANSLATION",
      accepted: false,
    });
    expect(glasses.indicatorOn).toBe(false);
  });

  it("refuses a voice stop of translation during a hold, because no translation is running", async () => {
    const glasses = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.voiceCommand("stop translation");
    expect(glasses.indicatorOn).toBe(true);
    expect(glasses.eventLog.at(-1)).toEqual({
      kind: "VOICE_COMMAND",
      phrase: "stop translation",
      command: "STOP_TRANSLATION",
      accepted: false,
    });
  });

  it("refuses voice commands while disconnected", () => {
    const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)));
    expect(() => {
      glasses.voiceCommand("start translation");
    }).toThrow("not connected");
  });
});

describe("simulator event log: silence limit", () => {
  it("does not stop at 119,999 ms of silence and stops at 120,000 ms, with the cause logged", async () => {
    let now = 0;
    const glasses = await connected(() => now);
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    now = SILENCE_TIMEOUT_MS - 1;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(true);
    now = SILENCE_TIMEOUT_MS;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(false);
    expect(glasses.eventLog.slice(-2)).toEqual([
      { kind: "SESSION_ENDED", session: "TRANSLATION", cause: "SILENCE", atMs: SILENCE_TIMEOUT_MS },
      OFF,
    ]);
  });

  it("restarts the silence count from speech, and logs each speech activity with its time", async () => {
    let now = 0;
    const glasses = await connected(() => now);
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    now = 10_000;
    glasses.heardSpeech();
    now = 10_000 + SILENCE_TIMEOUT_MS - 1;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(true);
    now = 10_000 + SILENCE_TIMEOUT_MS;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(false);
    expect(glasses.eventLog).toContainEqual({ kind: "SPEECH_ACTIVITY", atMs: 10_000 });
  });

  it("restarts the silence count when a voice switch starts a new session", async () => {
    let now = 0;
    const glasses = await connected(() => now);
    await glasses.send(appSession("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 1));
    now = 100_000;
    glasses.voiceCommand("start translation");
    now = 100_000 + SILENCE_TIMEOUT_MS - 1;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(true);
  });

  it("does not stop push-to-talk for silence", async () => {
    let now = 0;
    const glasses = await connected(() => now);
    glasses.pressButton("BUTTON_ACTION_HOLD");
    now = SILENCE_TIMEOUT_MS * 3;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(true);
    expect(glasses.eventLog.some((event) => event.kind === "SESSION_ENDED")).toBe(false);
  });
});

describe("simulator event log: announcements and indicator changes", () => {
  it("records one announcement for each accepted translation start, and none for a refused one", async () => {
    const now = 0;
    const glasses = await connected(() => now);
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ENDED", 2));
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 3));
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ENDED", 4));
    glasses.pressButton("BUTTON_ACTION_HOLD");
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 4));
    glasses.voiceCommand("start translation");
    const announcements = glasses.eventLog.filter((event) => event.kind === "ANNOUNCEMENT");
    expect(announcements).toEqual([
      { kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT },
      { kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT },
      { kind: "ANNOUNCEMENT", text: TRANSLATION_START_ANNOUNCEMENT },
    ]);
  });

  it("records a caption start with no announcement", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.eventLog.some((event) => event.kind === "ANNOUNCEMENT")).toBe(false);
    expect(glasses.spoken).toEqual([]);
  });

  it("logs an indicator change only when it changes, not on every repeated emission", async () => {
    const glasses = await connected();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.eventLog.filter((event) => event.kind === "INDICATOR")).toEqual([
      { kind: "INDICATOR", on: true, reason: "INDICATOR_REASON_PHOTO_QUESTION" },
      { kind: "INDICATOR", on: false, reason: "INDICATOR_REASON_IDLE" },
    ]);
    await glasses.send({ protocolVersion: PROTOCOL_VERSION, sequence: 9, indicator: {} });
    expect(glasses.eventLog.filter((event) => event.kind === "INDICATOR")).toHaveLength(2);
  });

  it("ends a session on cutoff and logs the cause", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.cutOff();
    expect(glasses.eventLog.slice(-2)).toEqual([
      { kind: "SESSION_ENDED", session: "TRANSLATION", cause: "CUTOFF", atMs: 0 },
      OFF,
    ]);
  });

  it("logs gestures after cutoff while the cutoff precedence blocks every effect", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.cutOff();
    const before = glasses.eventLog.length;

    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.pressButton("BUTTON_ACTION_RELEASE");
    glasses.pressButton("BUTTON_ACTION_PRESS");

    expect(glasses.eventLog.slice(before)).toEqual([
      { kind: "BUTTON", action: "BUTTON_ACTION_SINGLE_TAP" },
      { kind: "BUTTON", action: "BUTTON_ACTION_DOUBLE_TAP" },
      { kind: "BUTTON", action: "BUTTON_ACTION_HOLD" },
      { kind: "BUTTON", action: "BUTTON_ACTION_RELEASE" },
      { kind: "BUTTON", action: "BUTTON_ACTION_PRESS" },
    ]);
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.indicatorOn).toBe(false);
  });
});

describe("simulator taps during a translation session", () => {
  it("logs the taps but gives them no effect, and the indicator stays on", async () => {
    const glasses = await connected();
    await glasses.send(appSession("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.indicatorOn).toBe(true);
    expect(glasses.eventLog.filter((event) => event.kind === "BUTTON")).toEqual([
      { kind: "BUTTON", action: "BUTTON_ACTION_SINGLE_TAP" },
      { kind: "BUTTON", action: "BUTTON_ACTION_DOUBLE_TAP" },
    ]);
  });
});

describe("simulator speech output (SIMULATED, not measured)", () => {
  it("records speech with a duration derived from the text length", async () => {
    const glasses = await connected();
    glasses.speak("Here is the answer");
    expect(glasses.eventLog).toEqual([
      {
        kind: "SPEECH_OUTPUT_SIMULATED",
        text: "Here is the answer",
        durationMs: "Here is the answer".length * SIMULATED_MS_PER_CHARACTER,
      },
    ]);
  });

  it("records a press that stops speech with a simulated delay inside the stop target", async () => {
    const glasses = await connected();
    glasses.speak("Hello");
    glasses.pressButton("BUTTON_ACTION_PRESS");
    expect(glasses.eventLog.at(-1)).toEqual({
      kind: "SPEECH_STOPPED_SIMULATED",
      delayMs: SIMULATED_STOP_DELAY_MS,
    });
    // The simulated delay is checked against the 0.5 second target. Nothing is measured.
    expect(SIMULATED_STOP_DELAY_MS).toBeLessThanOrEqual(SPEECH_STOP_TARGET_MS);
    expect(glasses.isSpeaking).toBe(false);
  });

  it("records no speech output while cut off", async () => {
    const glasses = await connected();
    glasses.cutOff();
    glasses.speak("This must not be spoken");
    expect(glasses.eventLog.some((event) => event.kind === "SPEECH_OUTPUT_SIMULATED")).toBe(false);
  });
});

describe("simulator captions", () => {
  it("delivers caption text only while a listening session runs", async () => {
    const glasses = await connected();
    expect(glasses.deliverCaption("Too early")).toBe(false);
    await glasses.send(appSession("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.deliverCaption("Good morning")).toBe(true);
    expect(glasses.eventLog).toContainEqual({ kind: "CAPTION_TEXT", text: "Good morning" });
    expect(glasses.eventLog.some((event) => isCaption(event, "Too early"))).toBe(false);
  });

  it("refuses caption text while disconnected", () => {
    const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)));
    expect(() => glasses.deliverCaption("Hello")).toThrow("not connected");
  });
});

describe("simulator event subscription", () => {
  it("delivers each event to a subscriber in log order, and stops after unsubscribe", async () => {
    const glasses = await connected();
    const seen: SimulatorEvent[] = [];
    const unsubscribe = glasses.subscribeEvents((event) => {
      seen.push(event);
    });
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.voiceCommand("start translation");
    unsubscribe();
    glasses.voiceCommand("stop translation");
    expect(seen).toEqual(glasses.eventLog.slice(0, seen.length));
    expect(seen.length).toBeGreaterThan(0);
    expect(glasses.eventLog.length).toBeGreaterThan(seen.length);
  });
});

function isCaption(event: SimulatorEvent, text: string): boolean {
  return event.kind === "CAPTION_TEXT" && event.text === text;
}

function isIndicatorOff(event: SimulatorEvent): boolean {
  return event.kind === "INDICATOR" && !event.on;
}
