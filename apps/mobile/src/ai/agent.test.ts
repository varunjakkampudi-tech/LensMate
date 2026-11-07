import { actionUrl, parseCalls, runAgentTask } from "./agent";
import { askText } from "./assistant";
import { listItems, saveItem } from "../memory/vault";

jest.mock("./assistant", () => ({
  askText: jest.fn(),
  toneInstruction: jest.fn(() => "Be warm and encouraging, like a kind friend."),
}));
jest.mock("../memory/vault", () => ({ listItems: jest.fn(), saveItem: jest.fn() }));

const answer = (text: string, costPaise = 1) => ({
  text,
  costPaise,
  latencyMs: 5,
  source: "mock" as const,
});

describe("agent tools", () => {
  it("builds phone actions only for known kinds and https links", () => {
    expect(actionUrl("call", "+91 12345 67890", "")?.url).toBe("tel:+911234567890");
    expect(actionUrl("sms", "+911", "on my way")?.url).toBe("sms:+911?body=on%20my%20way");
    expect(actionUrl("maps", "Charminar", "")?.url).toContain("query=Charminar");
    expect(actionUrl("web", "javascript:alert(1)", "")).toBeNull();
    expect(actionUrl("pay", "x", "")).toBeNull();
  });

  it("drops unknown calls and any call over its bounds before it can run", () => {
    const planned = parseCalls(
      JSON.stringify({
        calls: [
          { tool: "unknown_action", input: { query: "weather" } },
          { tool: "save_note", input: { text: "a".repeat(2001) } },
          { tool: "save_note", input: { title: "ok", text: "kept" } },
        ],
      }),
    );
    expect(planned.map((c) => c.tool)).toEqual(["save_note"]);
  });

  it("caps the plan at four calls and survives non-JSON replies", () => {
    const calls = Array.from({ length: 6 }, () => ({ tool: "recall_memory", input: {} }));
    expect(parseCalls(`Sure: ${JSON.stringify({ calls })}`)).toHaveLength(4);
    expect(parseCalls("no plan here")).toEqual([]);
  });
});

describe("runAgentTask", () => {
  beforeEach(() => jest.resetAllMocks());

  it("runs the planned tools, never executes phone actions, and sums the cost", async () => {
    (askText as jest.Mock)
      .mockResolvedValueOnce(
        answer(
          JSON.stringify({
            calls: [
              { tool: "unknown_action", input: { query: "weather" } },
              { tool: "save_note", input: { title: "Umbrella", text: "Bring one" } },
              { tool: "phone_action", input: { kind: "sms", target: "+911", body: "late" } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(answer("Done.", 2));
    (listItems as jest.Mock).mockResolvedValue([]);
    (saveItem as jest.Mock).mockResolvedValue(undefined);

    const steps: string[] = [];
    const result = await runAgentTask("plan", "en", (s) => steps.push(s.agent));

    expect(steps).toEqual(["Planner", "Memory keeper", "Action agent", "Writer"]);
    expect(saveItem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "note", title: "Umbrella", text: "Bring one" }),
    );
    expect(result.actions).toEqual([expect.objectContaining({ kind: "sms" })]);
    expect(result.costPaise).toBe(1 + 2);
    const writerPrompt = (askText as jest.Mock).mock.calls[1][0][0].content as string;
    expect(writerPrompt).toContain("not done yet");
  });

  it("sends no saved notes to the AI for a broad recall that matches none", async () => {
    (askText as jest.Mock)
      .mockResolvedValueOnce(
        answer(
          JSON.stringify({
            calls: [{ tool: "recall_memory", input: { query: "what did I note this week" } }],
          }),
        ),
      )
      .mockResolvedValueOnce(answer("Nothing matched.", 1));
    (listItems as jest.Mock).mockResolvedValue([
      { id: "u", kind: "note", title: "Umbrella", text: "Bring the blue umbrella", createdAt: 1 },
    ]);

    await runAgentTask("ask", "en", () => undefined);

    const writerPrompt = (askText as jest.Mock).mock.calls[1][0][0].content as string;
    expect(writerPrompt).toContain("none found");
    expect(writerPrompt).not.toContain("Umbrella");
  });
});
