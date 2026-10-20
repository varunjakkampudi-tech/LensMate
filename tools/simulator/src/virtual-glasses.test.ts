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

function setup(): { glasses: VirtualGlasses; fromGlasses: EnvelopeMessage[] } {
  const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)));
  const fromGlasses: EnvelopeMessage[] = [];
  glasses.subscribe((message) => {
    fromGlasses.push(message);
  });
  return { glasses, fromGlasses };
}

function sessionMessage(type: string, phase: string, sequence = 1): EnvelopeMessage {
  return { protocolVersion: PROTOCOL_VERSION, sequence, session: { type, phase } };
}

describe("VirtualGlasses", () => {
  it("refuses to send or press buttons while disconnected", async () => {
    const { glasses } = setup();
    expect(glasses.status).toBe("disconnected");
    expect(() => {
      glasses.pressButton("BUTTON_ACTION_PRESS");
    }).toThrow("not connected");
    await expect(
      glasses.send(sessionMessage("SESSION_TYPE_CAPTION", "SESSION_PHASE_ACTIVE")),
    ).rejects.toThrow("not connected");
  });

  it("delivers button events to the app after the codec round trip", async () => {
    const { glasses, fromGlasses } = setup();
    await glasses.connect();
    glasses.pressButton("BUTTON_ACTION_HOLD", 900);
    // The first envelope is the button event. A hold then turns the indicator on (gesture state machine).
    expect(fromGlasses[0]).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      button: { action: "BUTTON_ACTION_HOLD", pressMs: 900 },
    });
  });

  it("turns the indicator on for a capture session and off after it ends", async () => {
    const { glasses, fromGlasses } = setup();
    await glasses.connect();
    await glasses.send(sessionMessage("SESSION_TYPE_PUSH_TO_TALK", "SESSION_PHASE_ACTIVE"));
    expect(glasses.indicatorOn).toBe(true);
    expect(fromGlasses.at(-1)?.indicator).toEqual({
      on: true,
      reason: "INDICATOR_REASON_PUSH_TO_TALK",
    });

    await glasses.send(sessionMessage("SESSION_TYPE_PUSH_TO_TALK", "SESSION_PHASE_ENDED", 2));
    expect(glasses.indicatorOn).toBe(false);
    // proto3 omits on=false, so an absent `on` means the indicator is off.
    expect(fromGlasses.at(-1)?.indicator).toEqual({ reason: "INDICATOR_REASON_IDLE" });
  });

  it("refuses an app request to turn the indicator off during capture", async () => {
    const { glasses, fromGlasses } = setup();
    await glasses.connect();
    await glasses.send(sessionMessage("SESSION_TYPE_TRANSLATION", "SESSION_PHASE_ACTIVE"));
    await glasses.send({
      protocolVersion: PROTOCOL_VERSION,
      sequence: 7,
      indicator: { on: false, reason: "INDICATOR_REASON_IDLE" },
    });
    expect(glasses.indicatorOn).toBe(true);
    expect(fromGlasses.at(-1)).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      sequence: expect.any(Number) as number,
      ack: { ackedSequence: 7, error: "ERROR_CODE_CAPTURE_ACTIVE" },
    });
  });

  it("accepts an app request to turn the indicator off when no capture session is active", async () => {
    const { glasses, fromGlasses } = setup();
    await glasses.connect();
    await glasses.send({ protocolVersion: PROTOCOL_VERSION, sequence: 3, indicator: {} });
    expect(glasses.indicatorOn).toBe(false);
    // proto3 omits on=false, so an absent `on` means the indicator is off.
    expect(fromGlasses.at(-1)?.indicator).toEqual({ reason: "INDICATOR_REASON_IDLE" });
  });

  it("acknowledges a session with an unknown type or phase as malformed", async () => {
    const { glasses, fromGlasses } = setup();
    await glasses.connect();
    await glasses.send(sessionMessage("SESSION_TYPE_UNSPECIFIED", "SESSION_PHASE_ACTIVE", 4));
    expect(fromGlasses.at(-1)?.ack).toEqual({ ackedSequence: 4, error: "ERROR_CODE_MALFORMED" });
    await glasses.send(sessionMessage("SESSION_TYPE_CAPTION", "SESSION_PHASE_UNSPECIFIED", 5));
    expect(fromGlasses.at(-1)?.ack).toEqual({ ackedSequence: 5, error: "ERROR_CODE_MALFORMED" });
    expect(glasses.indicatorOn).toBe(false);
  });

  it("rejects a schema violation the app sends, before it reaches the glasses", async () => {
    const { glasses } = setup();
    await glasses.connect();
    await expect(
      glasses.send({
        protocolVersion: PROTOCOL_VERSION,
        sequence: 1,
        session: { type: "SESSION_TYPE_CAPTION_TYPO", phase: "SESSION_PHASE_ACTIVE" },
      }),
    ).rejects.toThrow();
    expect(glasses.receivedFromApp).toHaveLength(0);
  });

  it("stops delivering to a handler after it unsubscribes", async () => {
    const glasses = new VirtualGlasses(new ProtocolCodec(loadProtocolRoot(schemaPath)));
    const received: EnvelopeMessage[] = [];
    const unsubscribe = glasses.subscribe((message) => {
      received.push(message);
    });
    await glasses.connect();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    unsubscribe();
    glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
    expect(received).toHaveLength(1);
  });
});
