import { createSafeLogStream, toBrokerLogEntry } from "./safe-log-stream.js";

/** Synthetic values only. None is a real credential or a real person's data. */
const SECRET = "Bearer SYNTHETIC-TOKEN-0001";
const PROMPT = "SYNTHETIC private prompt about a conversation";
const EMAIL = "tester.synthetic@example.com";
const KEY = "sk-SYNTHETICKEY0001";

function pinoLine(fields: Record<string, unknown>): string {
  return JSON.stringify({ level: 30, time: 1_800_000_000_000, pid: 1, hostname: "h", ...fields });
}

describe("toBrokerLogEntry", () => {
  it("keeps only allowlisted fields and maps the Pino level name", () => {
    const entry = toBrokerLogEntry(
      pinoLine({
        msg: "request completed",
        reqId: "req-1",
        responseTime: 12.4,
        req: { method: "POST", url: "/v1/chat", headers: { authorization: SECRET } },
        res: { statusCode: 200 },
      }),
    );
    expect(entry).toEqual({
      timestamp: 1_800_000_000_000,
      level: "info",
      service: "broker",
      event: "request completed",
      requestId: "req-1",
      durationMs: 12,
    });
  });

  it("never copies request content, headers or error messages into the output", () => {
    const line = pinoLine({
      level: 50,
      msg: `failed for ${SECRET}`,
      reqId: "req-2",
      req: { body: { messages: [{ role: "user", content: PROMPT }] } },
      err: { code: "PROVIDER_TIMEOUT", message: `key ${KEY} email ${EMAIL}` },
    });
    const out = JSON.stringify(toBrokerLogEntry(line));
    for (const secret of [SECRET, PROMPT, EMAIL, KEY]) {
      expect(out).not.toContain(secret);
    }
    expect(toBrokerLogEntry(line)).toMatchObject({ level: "error", errorCode: "PROVIDER_TIMEOUT" });
  });

  it("replaces unmatched-route messages that carry a URL or query string", () => {
    const line = pinoLine({
      level: 30,
      msg: `Route GET:/v1/chat?token=${SECRET} not found`,
      reqId: "req-3",
    });
    const entry = toBrokerLogEntry(line);
    expect(entry).toMatchObject({ event: "unknown_event", requestId: "req-3" });
    expect(JSON.stringify(entry)).not.toContain("token=");
  });

  it("reports an unparseable line without echoing it", () => {
    const entry = toBrokerLogEntry(`not json ${SECRET}`);
    expect(entry).toEqual({ level: "error", event: "unparseable_log_line" });
    expect(JSON.stringify(entry)).not.toContain(SECRET);
  });
});

describe("createSafeLogStream", () => {
  it("splits chunks on newlines and writes one safe line per log entry", () => {
    const written: string[] = [];
    const stream = createSafeLogStream({ write: (chunk: string) => written.push(chunk) });
    const first = pinoLine({ msg: "one", reqId: "a" });
    const second = pinoLine({ msg: `two ${SECRET}`, reqId: "b" });
    // Split the second line across two writes to check buffering.
    stream.write(`${first}\n${second.slice(0, 20)}`);
    stream.write(`${second.slice(20)}\n`);
    stream.end();

    expect(written).toHaveLength(2);
    const [firstLine = "", secondLine = ""] = written;
    expect(JSON.parse(firstLine)).toMatchObject({ event: "one", requestId: "a" });
    expect(JSON.parse(secondLine)).toMatchObject({ requestId: "b" });
    expect(written.join("")).not.toContain("SYNTHETIC-TOKEN-0001");
  });
});
