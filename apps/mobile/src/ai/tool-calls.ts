/** The small set of actions the assistant can propose or perform from an explicit user request. */
type ToolName = "recall_memory" | "save_note" | "phone_action";

export interface ToolCall {
  readonly tool: ToolName;
  readonly input: Record<string, unknown>;
}

const TOOLS: readonly ToolName[] = ["recall_memory", "save_note", "phone_action"];
const ACTION_KINDS = ["call", "sms", "email", "maps", "web"] as const;

/** Upper bounds on what the planner may send. A call over a bound is refused, not cut short. */
export const TOOL_LIMITS = {
  title: 120,
  text: 2000,
  query: 300,
  target: 320,
  body: 1000,
} as const;

type Input = Record<string, unknown>;

/** A text field: absent gives "", a non-string or an over-long value refuses the call (null). */
function textField(input: Input, key: string, max: number): string | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string" || value.length > max) {
    return null;
  }
  return value.trim();
}

/** A required text field: it must be present and not empty. */
function requiredText(input: Input, key: string, max: number): string | null {
  const value = textField(input, key, max);
  return value === null || value === "" ? null : value;
}

function validInput(tool: ToolName, input: Input): Input | null {
  switch (tool) {
    case "recall_memory": {
      const query = textField(input, "query", TOOL_LIMITS.query);
      return query === null ? null : { query };
    }
    case "save_note": {
      const title = textField(input, "title", TOOL_LIMITS.title);
      const text = requiredText(input, "text", TOOL_LIMITS.text);
      return title === null || text === null ? null : { title, text };
    }
    case "phone_action": {
      const kind = input["kind"];
      if (typeof kind !== "string" || !(ACTION_KINDS as readonly string[]).includes(kind)) {
        return null;
      }
      const target = requiredText(input, "target", TOOL_LIMITS.target);
      const body = textField(input, "body", TOOL_LIMITS.body);
      return target === null || body === null ? null : { kind, target, body };
    }
  }
}

/** Checks one planned call. Returns the normalised call, or null when it is unknown or fails its bounds. */
export function validateCall(raw: unknown): ToolCall | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { tool, input } = raw as { tool?: unknown; input?: unknown };
  if (typeof tool !== "string" || !(TOOLS as readonly string[]).includes(tool)) {
    return null;
  }
  const safeInput: Input =
    typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Input) : {};
  const checked = validInput(tool as ToolName, safeInput);
  return checked === null ? null : { tool: tool as ToolName, input: checked };
}

/** At most this many calls run for one goal. */
export const MAX_CALLS = 4;
