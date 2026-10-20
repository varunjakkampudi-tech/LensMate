import path from "node:path";
import {
  PROTOCOL_VERSION,
  ProtocolCodec,
  loadProtocolRoot,
  type EnvelopeMessage,
} from "@lensmate/protocol";
import { VirtualGlasses } from "./virtual-glasses.js";

const schemaPath = path.resolve(
  __dirname,
  "../../../packages/protocol/proto/lensmate/v1/link.proto",
);

async function connected(): Promise<{ glasses: VirtualGlasses; fromGlasses: EnvelopeMessage[] }> {
  const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)));
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

describe("VirtualGlasses gestures", () => {
  it("records a photo capture for a single tap from idle, with no indicator", async () => {
    const { glasses } = await connected();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
    expect(glasses.indicatorOn).toBe(false);
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
});
