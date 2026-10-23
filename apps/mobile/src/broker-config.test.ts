import { parseBrokerBaseUrl } from "./broker-config";

describe("parseBrokerBaseUrl", () => {
  it("accepts an https origin and normalises it", () => {
    expect(parseBrokerBaseUrl("https://broker.example.org/")).toEqual({
      ok: true,
      baseUrl: "https://broker.example.org",
    });
    expect(parseBrokerBaseUrl("  https://broker.example.org:8443  ")).toEqual({
      ok: true,
      baseUrl: "https://broker.example.org:8443",
    });
  });

  it("reports a missing value as not configured, and never assumes a hostname", () => {
    expect(parseBrokerBaseUrl(undefined)).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(parseBrokerBaseUrl("   ")).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
  });

  it("refuses plain HTTP except for loopback development", () => {
    expect(parseBrokerBaseUrl("http://broker.example.org")).toEqual({
      ok: false,
      reason: "INSECURE",
    });
    expect(parseBrokerBaseUrl("http://127.0.0.1:8080")).toEqual({
      ok: true,
      baseUrl: "http://127.0.0.1:8080",
    });
    expect(parseBrokerBaseUrl("http://localhost:8080")).toEqual({
      ok: true,
      baseUrl: "http://localhost:8080",
    });
  });

  it("refuses credentials in the URL, query strings, fragments, paths and other schemes", () => {
    for (const value of [
      "https://user:pass@broker.example.org",
      "https://broker.example.org/?token=1",
      "https://broker.example.org/#x",
      "https://broker.example.org/v1",
      "ftp://broker.example.org",
      "not a url",
    ]) {
      expect(parseBrokerBaseUrl(value)).toEqual({ ok: false, reason: "INVALID" });
    }
  });
});
