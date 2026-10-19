import path from "node:path";
import { PROTOCOL_VERSION, ProtocolCodec, ProtocolError, loadProtocolRoot } from "./codec.js";
import type { EnvelopeMessage } from "./codec.js";

const schemaPath = path.resolve(__dirname, "../proto/smartglass/v1/link.proto");

function codec(): ProtocolCodec {
  return new ProtocolCodec(loadProtocolRoot(schemaPath));
}

function protocolErrorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ProtocolError ? error.code : "NOT_PROTOCOL_ERROR";
  }
  return undefined;
}

describe("ProtocolCodec", () => {
  it("round-trips every Envelope body type", () => {
    const c = codec();
    const messages: EnvelopeMessage[] = [
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 1,
        hello: { role: "DEVICE_ROLE_APP", appBuild: "1" },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 2,
        button: { action: "BUTTON_ACTION_PRESS", pressMs: 120 },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 3,
        indicator: { on: true, reason: "INDICATOR_REASON_PUSH_TO_TALK" },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 4,
        session: { type: "SESSION_TYPE_TRANSLATION", phase: "SESSION_PHASE_ACTIVE" },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        sequence: 5,
        ack: { ackedSequence: 4, error: "ERROR_CODE_REPLAYED" },
      },
    ];
    for (const message of messages) {
      expect(c.decode(c.encode(message))).toMatchObject(message);
    }
  });

  it("refuses to encode a message with another protocol version", () => {
    expect(protocolErrorCode(() => codec().encode({ protocolVersion: 2, sequence: 1 }))).toBe(
      "UNSUPPORTED_VERSION",
    );
  });

  it("rejects an Envelope from another protocol version on decode", () => {
    const c = codec();
    const bytes = c.encode({ protocolVersion: PROTOCOL_VERSION, sequence: 1 });
    // Field 1 (protocol_version) is the first varint: tag byte 0x08, then the value byte.
    const tampered = Uint8Array.from(bytes);
    tampered[1] = 9;
    expect(protocolErrorCode(() => c.decode(tampered))).toBe("UNSUPPORTED_VERSION");
  });

  it("rejects bytes that are not an Envelope", () => {
    expect(protocolErrorCode(() => codec().decode(Uint8Array.from([0xff, 0xff, 0xff])))).toBe(
      "MALFORMED",
    );
  });

  it("rejects an unknown enum name on encode instead of sending the default value", () => {
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      button: { action: "BUTTON_ACTION_BOGUS", pressMs: 120 },
    };
    expect(protocolErrorCode(() => codec().encode(message))).toBe("MALFORMED");
  });

  it("rejects a numeric enum value on encode, so only schema names cross the boundary", () => {
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      button: { action: 1, pressMs: 0 },
    };
    expect(protocolErrorCode(() => codec().encode(message as unknown as EnvelopeMessage))).toBe(
      "MALFORMED",
    );
  });

  it("rejects an Envelope that is not an object", () => {
    expect(
      protocolErrorCode(() => codec().encode("not an envelope" as unknown as EnvelopeMessage)),
    ).toBe("MALFORMED");
  });
});
