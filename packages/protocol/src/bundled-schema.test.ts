import path from "node:path";
import {
  PROTOCOL_VERSION,
  ProtocolCodec,
  loadBundledProtocolRoot,
  loadProtocolRoot,
} from "./index.js";

describe("bundled schema", () => {
  it("encodes exactly the same bytes as the .proto source", () => {
    const schemaPath = path.resolve(__dirname, "../proto/smartglass/v1/link.proto");
    const fromSource = new ProtocolCodec(loadProtocolRoot(schemaPath));
    const bundled = new ProtocolCodec(loadBundledProtocolRoot());
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 42,
      session: { type: "SESSION_TYPE_PHOTO_QUESTION", phase: "SESSION_PHASE_ACTIVE" },
    };
    expect(Buffer.from(bundled.encode(message))).toEqual(Buffer.from(fromSource.encode(message)));
  });
});
