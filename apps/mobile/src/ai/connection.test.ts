import { checkBrokerReachable, describeAiConnection, type AiConnectionInput } from "./connection";

const BASE: AiConnectionInput = {
  endpointConfigured: false,
  enrolled: false,
  disclosureAccepted: false,
  reachable: "not checked",
  lastAnswerSource: null,
  lastRequest: null,
  lastError: null,
  spentPaise: null,
  capPaise: null,
};

function row(input: AiConnectionInput, id: string) {
  const r = describeAiConnection(input).find((x) => x.id === id);
  if (r === undefined) {
    throw new Error(`no row ${id}`);
  }
  return r;
}

describe("AI connection panel", () => {
  it("reports each state separately, not as one message", () => {
    const rows = describeAiConnection(BASE);
    expect(rows.map((r) => r.id)).toEqual([
      "endpoint",
      "reachable",
      "enrolled",
      "disclosure",
      "provider",
      "openrouter",
      "last",
      "spend",
    ]);
  });

  it("says Not checked for reachability and OpenRouter until a check actually ran", () => {
    expect(row(BASE, "reachable").value).toBe("Not checked");
    expect(row(BASE, "openrouter").value).toBe("Not checked from the phone");
  });

  it("does not claim a live provider from a mock answer", () => {
    expect(row({ ...BASE, lastAnswerSource: "mock" }, "provider").value).toMatch(/Mock/);
    expect(row({ ...BASE, lastAnswerSource: "openrouter" }, "provider").value).toBe(
      "Live provider",
    );
  });

  it("shows the actual last error text when the last request failed", () => {
    const r = row(
      {
        ...BASE,
        lastRequest: { ok: false, route: "vision", latencyMs: 40 },
        lastError: "Network request failed",
      },
      "last",
    );
    expect(r).toMatchObject({ value: "Network request failed", tone: "error" });
  });

  it("states that spending is unavailable until the phone is enrolled and the notice accepted", () => {
    expect(row(BASE, "spend").value).toMatch(/Not available/);
    expect(row({ ...BASE, spentPaise: 1250, capPaise: 50000 }, "spend").value).toBe(
      "₹12.50 of ₹500.00 cap",
    );
  });

  it("marks an unset address as an error with a plain value", () => {
    expect(row(BASE, "endpoint")).toMatchObject({ value: "No", tone: "error" });
  });
});

describe("broker reachability check", () => {
  it("counts a 401 from a protected route as reachable, and sends no credential", async () => {
    const fetchImpl = jest.fn(async () => new Response(null, { status: 401 }));

    const result = await checkBrokerReachable(
      "https://broker.example",
      fetchImpl as unknown as typeof fetch,
      new AbortController().signal,
    );

    expect(result).toBe("yes");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://broker.example/v1/usage");
    expect(init.headers).toBeUndefined();
  });

  it("reports a network failure as not reachable", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });

    await expect(
      checkBrokerReachable(
        "https://broker.example",
        fetchImpl as unknown as typeof fetch,
        new AbortController().signal,
      ),
    ).resolves.toBe("no");
  });

  it("reports an unexpected status as not reachable, not as working", async () => {
    const fetchImpl = jest.fn(async () => new Response("oops", { status: 500 }));

    await expect(
      checkBrokerReachable(
        "https://broker.example",
        fetchImpl as unknown as typeof fetch,
        new AbortController().signal,
      ),
    ).resolves.toBe("no");
  });
});
