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

function setup() {
  const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)), () => 100);
  const received: EnvelopeMessage[] = [];
  glasses.subscribe((message) => {
    received.push(message);
  });
  return { glasses, received };
}

describe("VirtualGlasses", () => {
  it("requires a connected link", () => {
    const { glasses } = setup();
    expect(() => {
      glasses.pressButton("BUTTON_ACTION_PRESS");
    }).toThrow("not connected");
  });

  it("delivers button events to the app through the protocol codec", async () => {
    const { glasses, received } = setup();
    await glasses.connect();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(received[0]).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      button: { action: "BUTTON_ACTION_SINGLE_TAP" },
    });
    expect(glasses.gestureEffects).toEqual(["CAPTURE_PHOTO"]);
  });

  it("shows the photo-question indicator for a double-tap visual question", async () => {
    const { glasses, received } = setup();
    await glasses.connect();
    glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    expect(glasses.gestureEffects).toEqual(["CAPTURE_VISUAL_QUESTION"]);
    expect(
      received
        .filter((message) => message.indicator !== undefined)
        .map((message) => message.indicator),
    ).toEqual([
      { on: true, reason: "INDICATOR_REASON_PHOTO_QUESTION" },
      { reason: "INDICATOR_REASON_IDLE" },
    ]);
  });

  it("turns the recording indicator on for microphone use and off on release", async () => {
    const { glasses, received } = setup();
    await glasses.connect();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    expect(glasses.indicatorOn).toBe(true);
    expect(received.at(-1)?.indicator).toMatchObject({
      on: true,
      reason: "INDICATOR_REASON_PUSH_TO_TALK",
    });
    glasses.pressButton("BUTTON_ACTION_RELEASE");
    expect(glasses.indicatorOn).toBe(false);
    expect(glasses.gestureEffects).toEqual(["START_PUSH_TO_TALK", "SEND_QUESTION"]);
  });

  it("does not allow software to turn the indicator off during capture", async () => {
    const { glasses, received } = setup();
    await glasses.connect();
    glasses.pressButton("BUTTON_ACTION_HOLD");
    await glasses.send({
      protocolVersion: PROTOCOL_VERSION,
      sequence: 20,
      indicator: { on: false },
    });
    expect(glasses.indicatorOn).toBe(true);
    expect(received.at(-1)?.ack).toEqual({ ackedSequence: 20, error: "ERROR_CODE_CAPTURE_ACTIVE" });
  });

  it("models spoken answers and lets a press stop speech", async () => {
    const { glasses } = setup();
    await glasses.connect();
    glasses.speak("Hello");
    expect(glasses.isSpeaking).toBe(true);
    glasses.pressButton("BUTTON_ACTION_PRESS");
    expect(glasses.isSpeaking).toBe(false);
    expect(glasses.eventLog.at(-1)).toEqual({ kind: "SPEECH_STOPPED_SIMULATED", delayMs: 0 });
  });

  it("locks capture after an emergency cutoff", async () => {
    const { glasses } = setup();
    await glasses.connect();
    glasses.cutOff();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(glasses.gestureEffects).toEqual([]);
  });
});
