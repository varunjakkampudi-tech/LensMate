import protobuf from "protobufjs";

/** Protocol version carried in every Envelope. Peers reject any other version (Standards 9). */
export const PROTOCOL_VERSION = 1;

const ENVELOPE_TYPE = "smartglass.v1.Envelope";

export type ProtocolErrorCode = "UNSUPPORTED_VERSION" | "MALFORMED";

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

/** Envelope as plain objects, using camelCase field names as protobufjs exposes them. */
export interface EnvelopeMessage {
  protocolVersion: number;
  sequence: number;
  hello?: { role: string; appBuild: string };
  button?: { action: string; pressMs: number };
  indicator?: { on: boolean; reason: string };
  session?: { type: string; phase: string };
  ack?: { ackedSequence: number; error: string };
}

/** Loads the schema from a .proto file. Callers pass the path, so the package has no path assumptions. */
export function loadProtocolRoot(protoPath: string): protobuf.Root {
  const root = protobuf.loadSync(protoPath);
  root.resolveAll();
  return root;
}

/**
 * protobufjs silently replaces an unknown enum name with the default value. This check rejects it
 * instead, so a typo never reaches the wire as a valid zero value (no silent failures).
 */
function assertKnownEnumNames(type: protobuf.Type, value: unknown): void {
  if (typeof value !== "object" || value === null) {
    throw new ProtocolError("MALFORMED", `expected an object for ${type.name}`);
  }
  const record = value as Record<string, unknown>;
  for (const field of type.fieldsArray) {
    const fieldValue = record[field.name];
    if (fieldValue === undefined) {
      continue;
    }
    const resolved = field.resolvedType;
    if (resolved instanceof protobuf.Enum) {
      if (
        typeof fieldValue !== "string" ||
        !Object.prototype.hasOwnProperty.call(resolved.values, fieldValue)
      ) {
        throw new ProtocolError("MALFORMED", `unknown value for enum field ${field.name}`);
      }
    } else if (resolved instanceof protobuf.Type) {
      assertKnownEnumNames(resolved, fieldValue);
    }
  }
}

/** Encodes and decodes Envelopes, rejecting unknown protocol versions and malformed bytes. */
export class ProtocolCodec {
  private readonly envelopeType: protobuf.Type;

  constructor(root: protobuf.Root) {
    this.envelopeType = root.lookupType(ENVELOPE_TYPE);
  }

  encode(message: EnvelopeMessage): Uint8Array {
    assertKnownEnumNames(this.envelopeType, message);
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      throw new ProtocolError(
        "UNSUPPORTED_VERSION",
        "cannot encode an unsupported protocol version",
      );
    }
    const payload = this.envelopeType.fromObject(message);
    return this.envelopeType.encode(payload).finish();
  }

  decode(bytes: Uint8Array): EnvelopeMessage {
    let decoded: EnvelopeMessage;
    try {
      decoded = this.envelopeType.toObject(this.envelopeType.decode(bytes), {
        enums: String,
        longs: Number,
        defaults: false,
      }) as EnvelopeMessage;
    } catch {
      throw new ProtocolError("MALFORMED", "bytes do not decode as an Envelope");
    }
    if (decoded.protocolVersion !== PROTOCOL_VERSION) {
      throw new ProtocolError("UNSUPPORTED_VERSION", "unsupported protocol version");
    }
    return decoded;
  }
}
