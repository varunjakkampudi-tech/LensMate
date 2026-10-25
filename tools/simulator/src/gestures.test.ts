import path from "node:path";
import {
  PROTOCOL_VERSION,
  ProtocolCodec,
  loadProtocolRoot,
  type EnvelopeMessage,
} from "@lensmate/protocol";
import { SILENCE_TIMEOUT_MS, TRANSLATION_START_ANNOUNCEMENT } from "@lensmate/core";
import { VirtualGlasses } from "./virtual-glasses.js";

const schemaPath = path.resolve(
  __dirname,
  "../../../packages/protocol/proto/lensmate/v1/link.proto",
);

async function connected(
  clock?: () => number,
): Promise<{ glasses: VirtualGlasses; fromGlasses: EnvelopeMessage[] }> {
  const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)), clock);
  const fromGlasses: EnvelopeMessage[] = [];
  glasses.subscribe((message) => {
    fromGlasses.push(message);
  });
  await glasses.connect();
  return { glasses, fromGlasses };
}

function sessionMessage(type: string, phase: string, sequence: number): EnvelopeMessage {
  return { protocolVersion: PROTOCOL_VERSION, sequence, session: { type, phase } };
}

function indicatorsFrom(messages: readonly EnvelopeMessage[]): unknown[] {
  return messages.flatMap((message) =>
    message.indicator === undefined ? [] : [message.indicator],
  );
}

describe("VirtualGlasses gestures", () => {
  it("captures a photo for a single tap from idle, with the indicator on for the capture only", async () => {
    const { glasses, fromGlasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
    expect(glasses.indicatorOn).toBe(false);
    expect(indicatorsFrom(fromGlasses)).toEqual([
      { on: true, reason: "INDICATOR_REASON_PHOTO_QUESTION" },
      { reason: "INDICATOR_REASON_IDLE" },
    ]);
  });

  it("captures a visual question for a double tap with the indicator on for the capture", async () => {
    const { glasses, fromGlasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_VISUAL_QUESTION"]);
    expect(indicatorsFrom(fromGlasses)).toEqual([
      { on: true, reason: "INDICATOR_REASON_PHOTO_QUESTION" },
      { reason: "INDICATOR_REASON_IDLE" },
    ]);
  });

  it("turns the indicator on while the hold is active and off after release", async () => {
    const { glasses, fromGlasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    expect(glasses.indicatorOn).toBe(true);
    expect(fromGlasses.at(-1)?.indicator).toEqual({
      on: true,
      reason: "INDICATOR_REASON_PUSH_TO_TALK",
    });

    glasses.pressButton("BUTTON_ACTION_RELEASE");
    expect(glasses.indicatorOn).toBe(false);
    expect(glasses.gestureEffects).toEqual(["START_PUSH_TO_TALK", "SEND_QUESTION"]);
  });

  it("does not capture a photo while a hold is active", async () => {
    const { glasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    expect(glasses.gestureEffects).toEqual(["START_PUSH_TO_TALK"]);
  });

  it("cancels the question on a second press during a hold", async () => {
    const { glasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.pressButton("BUTTON_ACTION_PRESS");
    expect(glasses.indicatorOn).toBe(false);
    expect(glasses.gestureEffects.at(-1)).toBe("CANCEL_QUESTION");
  });

  it("ignores taps during a translation session the app started", async () => {
    const { glasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.indicatorOn).toBe(true);
  });

  it("lets speech precedence block every session gesture except press-to-stop", async () => {
    const { glasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    glasses.speak("A translated answer");

    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.pressButton("BUTTON_ACTION_RELEASE");
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.isSpeaking).toBe(true);

    glasses.pressButton("BUTTON_ACTION_PRESS");
    expect(glasses.gestureEffects).toEqual(["STOP_SPEECH"]);
    expect(glasses.indicatorOn).toBe(true);
  });

  it("refuses to start translation from the app while a hold is active", async () => {
    const { glasses, fromGlasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 9));
    expect(fromGlasses.at(-1)?.ack).toEqual({
      ackedSequence: 9,
      error: "ERROR_CODE_CAPTURE_ACTIVE",
    });
  });

  it("stops a translation session the app started, so taps work again", async () => {
    const { glasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ENDED", 2));
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
  });

  it("ignores button actions it does not map, without changing state", async () => {
    const { glasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_UNSPECIFIED");
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.indicatorOn).toBe(false);
  });

  it("has no button action for a triple tap or five presses, so neither can start companion or emergency", async () => {
    const { glasses } = await connected();
    expect(() => {
      glasses.pressButton("BUTTON_ACTION_TRIPLE_TAP");
    }).toThrow();
    expect(() => {
      glasses.pressButton("BUTTON_ACTION_FIVE_PRESS");
    }).toThrow();
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.indicatorOn).toBe(false);
  });
});

describe("VirtualGlasses session rules (v9 section 21)", () => {
  it("refuses an app request to start push-to-talk or a photo session, which start only by gesture", async () => {
    const { glasses, fromGlasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_PUSH_TO_TALK", "SESSION_PHASE_ACTIVE", 1));
    expect(fromGlasses.at(-1)?.ack).toEqual({ ackedSequence: 1, error: "ERROR_CODE_MALFORMED" });
    await glasses.send(sessionMessage("SESSION_TYPE_PHOTO_QUESTION", "SESSION_PHASE_ACTIVE", 2));
    expect(fromGlasses.at(-1)?.ack).toEqual({ ackedSequence: 2, error: "ERROR_CODE_MALFORMED" });
    expect(glasses.indicatorOn).toBe(false);
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
  });

  it("announces translation at every start from the app, before the indicator turns on (G15)", async () => {
    const { glasses, fromGlasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.spoken).toEqual([TRANSLATION_START_ANNOUNCEMENT]);
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ENDED", 2));
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 3));
    expect(glasses.spoken).toEqual([
      TRANSLATION_START_ANNOUNCEMENT,
      TRANSLATION_START_ANNOUNCEMENT,
    ]);
    expect(indicatorsFrom(fromGlasses).at(-1)).toEqual({
      on: true,
      reason: "INDICATOR_REASON_TRANSLATION",
    });
  });

  it("does not announce a refused translation start", async () => {
    const { glasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.spoken).toEqual([]);
  });

  it("ends translation after two minutes of silence, and keeps it before then", async () => {
    let now = 0;
    const { glasses, fromGlasses } = await connected(() => now);
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    now = SILENCE_TIMEOUT_MS - 1;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(true);

    now = SILENCE_TIMEOUT_MS;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(false);
    expect(fromGlasses.at(-1)?.indicator).toEqual({ reason: "INDICATOR_REASON_IDLE" });
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
  });

  it("resets the silence timer when speech is heard", async () => {
    let now = 0;
    const { glasses } = await connected(() => now);
    await glasses.send(sessionMessage("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 1));
    now = SILENCE_TIMEOUT_MS - 10;
    glasses.heardSpeech();
    now = SILENCE_TIMEOUT_MS + 10;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(true);
    now = SILENCE_TIMEOUT_MS * 2 - 10;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(false);
  });

  it("does not end the translation when an app request ends a caption session that never started", async () => {
    const { glasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    await glasses.send(sessionMessage("SESSION_TYPE_CAPTION", "SESSION_PHASE_ENDED", 2));
    expect(glasses.indicatorOn).toBe(true);
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual([]);
  });

  it("stops speech on a press and does nothing else with that press (G19)", async () => {
    const { glasses } = await connected();
    glasses.speak("Here is the answer");
    expect(glasses.isSpeaking).toBe(true);
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.isSpeaking).toBe(true);
    glasses.pressButton("BUTTON_ACTION_PRESS");
    expect(glasses.gestureEffects).toEqual(["STOP_SPEECH"]);
    expect(glasses.isSpeaking).toBe(false);
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["STOP_SPEECH", "CAPTURE_PHOTO"]);
  });

  it("lets taps work again once speech finishes on its own", async () => {
    const { glasses } = await connected();
    glasses.speak("Here is the answer");
    glasses.finishSpeech();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
  });

  it("cuts off camera and microphone, stops listening, and refuses everything until power returns", async () => {
    const { glasses, fromGlasses } = await connected();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.indicatorOn).toBe(true);
    glasses.cutOff();
    expect(glasses.indicatorOn).toBe(false);
    expect(fromGlasses.at(-1)?.indicator).toEqual({ reason: "INDICATOR_REASON_IDLE" });

    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_HOLD");
    expect(glasses.gestureEffects).toEqual([]);
    expect(glasses.indicatorOn).toBe(false);

    glasses.speak("This must not be spoken");
    expect(glasses.spoken).not.toContain("This must not be spoken");

    await glasses.send(sessionMessage("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 2));
    expect(fromGlasses.at(-1)?.ack).toEqual({
      ackedSequence: 2,
      error: "ERROR_CODE_CAPTURE_ACTIVE",
    });
  });

  it("cuts off push-to-talk and ends its indicator", async () => {
    const { glasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.cutOff();
    expect(glasses.indicatorOn).toBe(false);
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    glasses.pressButton("BUTTON_ACTION_HOLD");
    glasses.pressButton("BUTTON_ACTION_RELEASE");
    glasses.pressButton("BUTTON_ACTION_PRESS");
    expect(glasses.gestureEffects).toEqual(["START_PUSH_TO_TALK"]);
  });

  it("does not record an announcement or silence check for a caption session start", async () => {
    let now = 0;
    const { glasses } = await connected(() => now);
    await glasses.send(sessionMessage("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE", 1));
    expect(glasses.spoken).toEqual([]);
    now = SILENCE_TIMEOUT_MS;
    glasses.checkSilence();
    expect(glasses.indicatorOn).toBe(false);
  });
});
