import { REDACTED, redactText, toSafeLogEntry } from "./log-redaction.js";

/** Synthetic values only. None of these is a real credential or a real person's data. */
const SYNTHETIC = {
  bearer: "Bearer SYNTHETIC-TOKEN-0001",
  providerKey: "sk-SYNTHETICKEY0001",
  email: "tester.synthetic@example.com",
  phone: "+91 98765 43210",
  transcript: "SYNTHETIC transcript of a private conversation",
  imageBase64: "data:image/jpeg;base64,SYNTHETICIMAGEBYTES",
  password: "SYNTHETIC-PASSWORD-0001",
  otp: "123456",
  address: "SYNTHETIC 12 Test Lane",
};

describe("toSafeLogEntry", () => {
  it("keeps only allowlisted fields and drops everything else", () => {
    const entry = toSafeLogEntry({
      timestamp: "2026-10-20T00:00:00Z",
      level: "error",
      requestId: "req-1",
      feature: "assistant",
      durationMs: 120,
      errorCode: "PROVIDER_TIMEOUT",
      transcript: SYNTHETIC.transcript,
      image: SYNTHETIC.imageBase64,
      password: SYNTHETIC.password,
      otp: SYNTHETIC.otp,
      address: SYNTHETIC.address,
    });
    expect(Object.keys(entry).sort()).toEqual(
      ["timestamp", "level", "requestId", "feature", "durationMs", "errorCode"].sort(),
    );
  });

  it("never lets synthetic secrets or personal data reach the serialized log line", () => {
    const line = JSON.stringify(
      toSafeLogEntry({
        level: "warn",
        event: "provider_call",
        requestId: `req ${SYNTHETIC.bearer}`,
        feature: `contact ${SYNTHETIC.email}`,
        errorCode: `key ${SYNTHETIC.providerKey} phone ${SYNTHETIC.phone}`,
        transcript: SYNTHETIC.transcript,
        image: SYNTHETIC.imageBase64,
        password: SYNTHETIC.password,
        otp: SYNTHETIC.otp,
        address: SYNTHETIC.address,
      }),
    );
    for (const secret of [
      SYNTHETIC.bearer,
      SYNTHETIC.providerKey,
      SYNTHETIC.email,
      SYNTHETIC.phone,
      SYNTHETIC.transcript,
      SYNTHETIC.imageBase64,
      SYNTHETIC.password,
      SYNTHETIC.otp,
      SYNTHETIC.address,
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain(REDACTED);
  });

  it("keeps numbers, booleans and null for allowlisted fields and drops other types", () => {
    const entry = toSafeLogEntry({
      durationMs: 0,
      errorCode: null,
      level: true,
      feature: undefined,
    });
    expect(entry).toEqual({ durationMs: 0, errorCode: null, level: true });
  });
});

describe("redactText", () => {
  it("redacts bearer tokens, provider-style keys, email addresses and phone numbers", () => {
    expect(redactText(SYNTHETIC.bearer)).toBe(REDACTED);
    expect(redactText(SYNTHETIC.providerKey)).toBe(REDACTED);
    expect(redactText(SYNTHETIC.email)).toBe(REDACTED);
    expect(redactText(SYNTHETIC.phone)).toBe(REDACTED);
  });

  it("redacts basic-auth credentials, key=value secrets and inline base64 images", () => {
    expect(redactText("Basic SYNTHETICBASICCRED0001==")).toBe(REDACTED);
    expect(redactText("api_key=SYNTHETIC-KEY-0001")).toBe(REDACTED);
    expect(redactText("password: SYNTHETIC-PASSWORD-0001")).toBe(REDACTED);
    expect(redactText(`image ${SYNTHETIC.imageBase64} sent`)).toBe(`image ${REDACTED} sent`);
  });

  it("redacts a key=value secret whose value contains spaces, to the end of the line", () => {
    const redacted = redactText("password=alpha beta gamma");
    expect(redacted).toBe(REDACTED);
    expect(redacted).not.toContain("beta");
    expect(redacted).not.toContain("gamma");
  });

  it("leaves ordinary text untouched", () => {
    expect(redactText("provider timed out after 800 ms")).toBe("provider timed out after 800 ms");
  });
});
