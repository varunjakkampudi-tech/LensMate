import { Linking } from "react-native";
import { askText, research, RequestCancelled, translate, type AiAnswer } from "./assistant";
import { relevantNotes } from "../memory/search";
import { listItems, saveItem } from "../memory/vault";
import { LANGS, type Lang, type Tone } from "../ui/prefs";
import { toneInstruction } from "./assistant";

/**
 * Multi-agent task runner. A planner agent splits the user's goal into at most four tool steps; specialist agents
 * (researcher, memory keeper, scheduler, action agent, translator) run them; a writer agent composes the result.
 * Phone actions are never executed by the agent: they are returned as proposals the user must tap to confirm.
 * No PC control, no background camera or microphone, and nothing outside the user's request.
 */
type AgentName =
  | "Planner"
  | "Researcher"
  | "Memory keeper"
  | "Scheduler"
  | "Action agent"
  | "Translator"
  | "Writer";

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

type ToolCall = { tool: string; input: Record<string, unknown> };

const PLANNER = [
  "You are the planner of a smart-glasses assistant. Break the user's goal into at most 4 tool calls. Tools:",
  'web_research{"query"} (live internet, costs money: use ONLY for current events, prices, weather, schedules or facts that change; never for stable general knowledge);',
  'recall_memory{"query"} (search the user\'s saved notes); save_note{"title","text"}; set_reminder{"title","minutes"};',
  `translate{"text","from","to"} (language codes: ${Object.keys(LANGS).join(", ")});`,
  'phone_action{"kind":"call"|"sms"|"email"|"maps"|"web","target","body"} (only propose, the user confirms).',
  'Reply with JSON only: {"calls":[{"tool":"...","input":{...}}]}. Use an empty list if no tool is needed.',
  "Plan save_note, set_reminder or phone_action ONLY when the user explicitly asks for them. For general questions you can answer yourself, plan no tools.",
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

export function parseCalls(text: string): ToolCall[] {
  try {
    const parsed = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "") as { calls?: unknown };
    return Array.isArray(parsed.calls)
      ? (parsed.calls as (ToolCall | null)[])
          .filter((c): c is ToolCall => c !== null && typeof c.tool === "string")
          .slice(0, 4)
      : [];
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
      if (call.tool === "web_research") {
        const text = charge(await research(str(input.query) || goal, lang, signal));
        findings.push(`Web research: ${text}`);
        step({ agent: "Researcher", summary: text.slice(0, 160), status: "done" });
      } else if (call.tool === "recall_memory") {
        // Broad requests (briefings, "today", "recent") fall back to the newest items.
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
      } else if (call.tool === "set_reminder") {
        const minutes = Math.max(1, Number(input.minutes) || 30);
        await saveItem({
          kind: "reminder",
          title: str(input.title) || goal,
          text: "",
          dueAt: Date.now() + minutes * 60_000,
        });
        findings.push(
          `Done: reminder "${str(input.title)}" set for ${new Date(Date.now() + minutes * 60_000).toLocaleTimeString()}.`,
        );
        step({
          agent: "Scheduler",
          summary: `Reminder in ${minutes} min: ${str(input.title)}`,
          status: "done",
        });
      } else if (call.tool === "translate") {
        const code = (v: unknown, fallback: Lang): Lang =>
          str(v) in LANGS ? (str(v) as Lang) : fallback;
        const result = await translate(
          str(input.text),
          code(input.from, "en"),
          code(input.to, lang),
          signal,
        );
        charge(result.answer);
        findings.push(`Translation: ${result.translation}`);
        step({ agent: "Translator", summary: result.translation, status: "done" });
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
        agent: call.tool === "web_research" ? "Researcher" : "Action agent",
        summary: `${call.tool} failed`,
        status: "failed",
      });
    }
  }

  stopIfCancelled();
  const final = await askText(
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
