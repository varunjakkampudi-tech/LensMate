import { MAX_CALLS, TOOL_LIMITS, validateCall } from "./tool-calls";

describe("validateCall", () => {
  it("refuses a tool that is not on the list", () => {
    expect(validateCall({ tool: "unknown_action", input: { query: "weather" } })).toBeNull();
    expect(validateCall({ tool: "delete_everything", input: {} })).toBeNull();
    expect(validateCall({ input: {} })).toBeNull();
    expect(validateCall(null)).toBeNull();
    expect(validateCall("save_note")).toBeNull();
  });

  it("keeps a valid note and trims its text", () => {
    expect(
      validateCall({ tool: "save_note", input: { title: " Gate ", text: " Code 42 " } }),
    ).toEqual({
      tool: "save_note",
      input: { title: "Gate", text: "Code 42" },
    });
  });

  it("refuses a note with no text, or with text over the limit", () => {
    expect(validateCall({ tool: "save_note", input: { title: "x" } })).toBeNull();
    expect(validateCall({ tool: "save_note", input: { text: "   " } })).toBeNull();
    expect(
      validateCall({ tool: "save_note", input: { text: "a".repeat(TOOL_LIMITS.text + 1) } }),
    ).toBeNull();
  });

  it("refuses a field of the wrong type instead of passing it on", () => {
    expect(validateCall({ tool: "save_note", input: { text: 42 } })).toBeNull();
    expect(validateCall({ tool: "recall_memory", input: { query: ["x"] } })).toBeNull();
  });

  it("accepts only the listed action kinds, and never an empty target", () => {
    expect(
      validateCall({ tool: "phone_action", input: { kind: "call", target: "+91 98765" } }),
    ).not.toBeNull();
    expect(
      validateCall({ tool: "phone_action", input: { kind: "shell", target: "rm -rf" } }),
    ).toBeNull();
    expect(validateCall({ tool: "phone_action", input: { kind: "call", target: "" } })).toBeNull();
  });

  it("caps the number of calls for one goal at four", () => {
    expect(MAX_CALLS).toBe(4);
  });
});
