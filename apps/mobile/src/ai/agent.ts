import { Linking } from "react-native";
import { askText, askTextStreamed, RequestCancelled, type AiAnswer } from "./assistant";
import { relevantNotes } from "../memory/search";
import { listItems, saveItem } from "../memory/vault";
import { type Lang, type Tone } from "../ui/prefs";
import { toneInstruction } from "./assistant";
import { MAX_CALLS, validateCall, type ToolCall } from "./tool-calls";

/** Plans a small number of user-requested memory or phone actions. Phone actions always wait for the user's tap. */
type AgentName = "Planner" | "Researcher" | "Memory keeper" | "Action agent" | "Writer";

export interface AgentStep {
  readonly agent: AgentName;
  readonly summary: string;
  readonly status: "done" | "failed";
}

export interface PhoneAction {
  readonly kind: "call" | "sms" | "email" | "maps" | "web";
  readonly label: string;
  readonly url: string;
}

export interface AgentResult {
  readonly steps: readonly AgentStep[];
  readonly answer: string;
  readonly actions: readonly PhoneAction[];
  readonly costPaise: number;
  /** "mock" when any step was answered by the mock provider, so no provider was paid. */
  readonly source: "openrouter" | "mock";
}

const PLANNER = [
  "You are the planner of a smart-glasses assistant. Break the user's goal into at most 4 tool calls. Tools:",
  'recall_memory{"query"} (search the user\'s saved notes); save_note{"title","text"};',
  'phone_action{"kind":"call"|"sms"|"email"|"maps"|"web","target","body"} (only propose, the user confirms).',
  'Reply with JSON only: {"calls":[{"tool":"...","input":{...}}]}. Use an empty list if no tool is needed.',
  "Plan save_note or phone_action ONLY when the user explicitly asks for them. For general questions you can answer yourself, plan no tools.",
  "Never plan actions that identify people, record in the background, control a computer, or pay money.",
].join(" ");

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** Builds the link the user is asked to tap. Anything the model proposes is checked here, never passed through. */
export function actionUrl(kind: string, target: string, body: string): PhoneAction | null {
  const t = encodeURIComponent(target);
  const b = encodeURIComponent(body);
  const digits = target.replace(/[^+\d]/g, "");
  switch (kind) {
    case "call":
      return digits === "" ? null : { kind, label: `Call ${target}`, url: `tel:${digits}` };
    case "sms":
      return digits === ""
        ? null
        : { kind, label: `Message ${target}`, url: `sms:${digits}?body=${b}` };
    case "email":
      return /^[^\s@?&#]+@[^\s@?&#]+$/.test(target)
        ? {
            kind,
            label: `Email ${target}`,
            url: `mailto:${encodeURIComponent(target)}?body=${b}`,
          }
        : null;
    case "maps":
      return {
        kind,
        label: `Directions to ${target}`,
        url: `https://www.google.com/maps/search/?api=1&query=${t}`,
      };
    case "web":
      return /^https:\/\//.test(target) ? { kind, label: `Open ${target}`, url: target } : null;
    default:
      return null;
  }
}

export function confirmAction(action: PhoneAction): Promise<void> {
  return Linking.openURL(action.url);
}

/** Reads the planner's JSON. Each call is checked; unknown or out-of-bounds calls are dropped, never run. */
export function parseCalls(text: string): ToolCall[] {
  try {
    const parsed = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "") as { calls?: unknown };
    if (!Array.isArray(parsed.calls)) {
      return [];
    }
    return parsed.calls
      .map((raw: unknown) => validateCall(raw))
      .filter((c): c is ToolCall => c !== null)
      .slice(0, MAX_CALLS);
  } catch {
    return [];
  }
}

export async function runAgentTask(
  goal: string,
  lang: Lang,
  onStep: (s: AgentStep) => void,
  signal?: AbortSignal,
  tone: Tone = "warm",
  /** Called with the answer so far, as the writer streams it. Omitted, the answer arrives whole. */
  onPartial?: (text: string) => void,
): Promise<AgentResult> {
  // Checked before every step, so a cancelled task runs no further tools and records no further steps.
  const stopIfCancelled = () => {
    if (signal?.aborted) {
      throw new RequestCancelled();
    }
  };
  const steps: AgentStep[] = [];
  const actions: PhoneAction[] = [];
  const findings: string[] = [];
  let cost = 0;
  let source: AgentResult["source"] = "openrouter";
  const step = (s: AgentStep) => {
    steps.push(s);
    onStep(s);
  };
  const charge = (a: AiAnswer) => {
    cost += a.costPaise;
    if (a.source === "mock") {
      source = "mock";
    }
    return a.text;
  };

  stopIfCancelled();
  const plan = await askText(
    [{ role: "user", content: `Goal: ${goal}\nNow: ${new Date().toString()}` }],
    "en",
    PLANNER,
    signal,
  );
  stopIfCancelled();
  const calls = parseCalls(charge(plan));
  step({
    agent: "Planner",
    summary: calls.length === 0 ? "No tools needed" : calls.map((c) => c.tool).join(" → "),
    status: "done",
  });

  for (const call of calls) {
    const input = call.input ?? {};
    stopIfCancelled();
    try {
      if (call.tool === "recall_memory") {
        // Only notes that match the question are sent to the AI. Broad requests get no notes, never the newest ones.
        const hits = relevantNotes(await listItems(), str(input.query), 6);
        findings.push(
          `Saved notes: ${hits.map((h) => `${h.title}: ${h.text.slice(0, 300)}`).join(" | ") || "none found"}`,
        );
        step({ agent: "Memory keeper", summary: `${hits.length} matching items`, status: "done" });
      } else if (call.tool === "save_note") {
        await saveItem({
          kind: "note",
          title: str(input.title) || "Agent note",
          text: str(input.text),
        });
        findings.push(`Done: saved note "${str(input.title)}" to Memory.`);
        step({
          agent: "Memory keeper",
          summary: `Saved note “${str(input.title)}”`,
          status: "done",
        });
      } else if (call.tool === "phone_action") {
        const action = actionUrl(str(input.kind), str(input.target), str(input.body));
        if (action !== null) {
          actions.push(action);
          findings.push(`Prepared (waiting for the user's tap, not done yet): ${action.label}.`);
        }
        step({
          agent: "Action agent",
          summary:
            action === null ? "Action refused" : `Proposed: ${action.label} (needs your tap)`,
          status: action === null ? "failed" : "done",
        });
      }
    } catch (error) {
      if (error instanceof RequestCancelled) {
        throw error;
      }
      step({
        agent: "Action agent",
        summary: `${call.tool} failed`,
        status: "failed",
      });
    }
  }

  stopIfCancelled();
  // The writer streams when the caller asks for partial text. Either way the answer is the same and is charged once.
  let streamed = "";
  const writer: typeof askText =
    onPartial === undefined
      ? askText
      : (history, writerLang, system, external) =>
          askTextStreamed(
            history,
            writerLang,
            (delta) => {
              streamed += delta;
              onPartial(streamed);
            },
            system,
            external,
          );
  const final = await writer(
    [
      {
        role: "user",
        content: `Goal: ${goal}\n\nResults from the agents:\n${findings.join("\n") || "(none)"}\n${actions.length > 0 ? `Proposed actions awaiting the user's tap: ${actions.map((a) => a.label).join(", ")}` : ""}\n\nWrite the final answer for the user.`,
      },
    ],
    lang,
    "You are the writer agent. When agent results exist, base the answer on them and never invent news, prices or saved items; when there are none, answer from your general knowledge. Be concise and concrete. Mention uncertainty. Do not claim an action was done unless the results say so. " +
      toneInstruction(tone),
    signal,
  );
  stopIfCancelled();
  charge(final);
  step({ agent: "Writer", summary: "Answer ready", status: "done" });
  return { steps, answer: final.text, actions, costPaise: cost, source };
}
