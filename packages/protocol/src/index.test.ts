import * as api from "./index.js";

describe("@lensmate/protocol public API", () => {
  it("exports the protocol version and the codec", () => {
    expect(api.PROTOCOL_VERSION).toBe(1);
    expect(typeof api.ProtocolCodec).toBe("function");
    expect(typeof api.loadProtocolRoot).toBe("function");
  });
});
