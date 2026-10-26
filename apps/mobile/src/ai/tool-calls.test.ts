import { MAX_CALLS, TOOL_LIMITS, validateCall } from "./tool-calls";

describe("validateCall", () => {
  it("refuses a tool that is not on the list, including research", () => {
    expect(validateCall({ tool: "web_research", input: { query: "weather" } })).toBeNull();
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

  it("bounds reminder minutes to whole numbers from 1 to a week", () => {
    expect(validateCall({ tool: "set_reminder", input: { title: "t", minutes: 30 } })).toEqual({
      tool: "set_reminder",
      input: { title: "t", minutes: 30 },
    });
    for (const minutes of [0, -5, 1.5, TOOL_LIMITS.minutes + 1, "30", Number.NaN]) {
      expect(validateCall({ tool: "set_reminder", input: { title: "t", minutes } })).toBeNull();
    }
  });

  it("accepts only known language codes for translation", () => {
    expect(
      validateCall({ tool: "translate", input: { text: "hi", from: "en", to: "te" } }),
    ).toEqual({
      tool: "translate",
      input: { text: "hi", from: "en", to: "te" },
    });
    expect(validateCall({ tool: "translate", input: { text: "hi", to: "xx" } })).toBeNull();
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
