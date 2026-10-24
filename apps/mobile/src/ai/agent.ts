import { Linking } from "react-native";
import { askText, research, translate, type AiAnswer } from "./assistant";
import { listItems, saveItem } from "../memory/vault";
import type { Lang } from "../ui/prefs";

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
}

type ToolCall = { tool: string; input: Record<string, unknown> };

const PLANNER =
  "You are the planner of a smart-glasses assistant. Break the user's goal into at most 4 tool calls. Tools: " +
  'web_research{"query"} (live internet, costs money: use ONLY for current events, prices, weather, schedules or facts that change; never for stable general knowledge); ' +
  'recall_memory{"query"} (search the user\'s saved notes); save_note{"title","text"}; ' +
  'set_reminder{"title","minutes"}; translate{"text","to":"en"|"te"}; ' +
  'phone_action{"kind":"call"|"sms"|"email"|"maps"|"web","target","body"} (only propose, the user confirms). ' +
  'Reply with JSON only: {"calls":[{"tool":"...","input":{...}}]}. Use an empty list if no tool is needed. ' +
  "Never plan actions that identify people, record in the background, control a computer, or pay money.";

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function actionUrl(kind: string, target: string, body: string): PhoneAction | null {
  const t = encodeURIComponent(target);
  const b = encodeURIComponent(body);
  switch (kind) {
    case "call":
      return { kind, label: `Call ${target}`, url: `tel:${target.replace(/[^+\d]/g, "")}` };
    case "sms":
      return {
        kind,
        label: `Message ${target}`,
        url: `sms:${target.replace(/[^+\d]/g, "")}?body=${b}`,
      };
    case "email":
      return { kind, label: `Email ${target}`, url: `mailto:${target}?body=${b}` };
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

function parseCalls(text: string): ToolCall[] {
  try {
    const parsed = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "") as { calls?: unknown };
    return Array.isArray(parsed.calls)
      ? (parsed.calls as ToolCall[]).filter((c) => typeof c.tool === "string").slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

export async function runAgentTask(
  goal: string,
  lang: Lang,
  onStep: (s: AgentStep) => void,
): Promise<AgentResult> {
  const steps: AgentStep[] = [];
  const actions: PhoneAction[] = [];
  const findings: string[] = [];
  let cost = 0;
  const step = (s: AgentStep) => {
    steps.push(s);
    onStep(s);
  };
  const charge = (a: AiAnswer) => {
    cost += a.costPaise;
    return a.text;
  };

  const plan = await askText(
    [{ role: "user", content: `Goal: ${goal}\nNow: ${new Date().toString()}` }],
    "en",
    PLANNER,
  );
  cost += plan.costPaise;
  const calls = parseCalls(plan.text);
  step({
    agent: "Planner",
    summary: calls.length === 0 ? "No tools needed" : calls.map((c) => c.tool).join(" → "),
    status: "done",
  });

  for (const call of calls) {
    const input = call.input ?? {};
    try {
      if (call.tool === "web_research") {
        const text = charge(await research(str(input.query) || goal, lang));
        findings.push(`Web research: ${text}`);
        step({ agent: "Researcher", summary: text.slice(0, 160), status: "done" });
      } else if (call.tool === "recall_memory") {
        const q = str(input.query)
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2);
        const all = await listItems();
        const matched = all.filter((i) =>
          q.some((w) => `${i.title} ${i.text}`.toLowerCase().includes(w)),
        );
        // Broad requests (briefings, "today", "recent") fall back to the newest items.
        const hits = (matched.length > 0 ? matched : all).slice(0, 6);
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
        const to = str(input.to) === "te" ? "te" : "en";
        const result = await translate(str(input.text), to === "te" ? "en" : "te", to);
        cost += result.answer.costPaise;
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
    } catch {
      step({
        agent: call.tool === "web_research" ? "Researcher" : "Action agent",
        summary: `${call.tool} failed`,
        status: "failed",
      });
    }
  }

  const final = await askText(
    [
      {
        role: "user",
        content: `Goal: ${goal}\n\nResults from the agents:\n${findings.join("\n") || "(none)"}\n${actions.length > 0 ? `Proposed actions awaiting the user's tap: ${actions.map((a) => a.label).join(", ")}` : ""}\n\nWrite the final answer for the user.`,
      },
    ],
    lang,
    "You are the writer agent. Use only the agent results and the goal; never invent news, facts or items. Be concise and concrete. Mention uncertainty. Do not claim an action was done unless the results say so.",
  );
  cost += final.costPaise;
  step({ agent: "Writer", summary: "Answer ready", status: "done" });
  return { steps, answer: final.text, actions, costPaise: cost };
}
