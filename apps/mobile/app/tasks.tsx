import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { confirmAction, runAgentTask, type AgentResult, type AgentStep } from "../src/ai/agent";
import { aiErrorText, costNote, research } from "../src/ai/assistant";
import {
  loadAutomations,
  runAutomation,
  saveAutomations,
  type Automation,
} from "../src/ai/automations";
import { memoryErrorText, saveItem } from "../src/memory/vault";
import { FeatureOff } from "../src/ui/feature-off";
import { Body, Btn, Card, Field, H2, Notice, Page, Row } from "../src/ui/kit";
import { usePrefs } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

const TEMPLATES: Omit<Automation, "id" | "enabled">[] = [
  {
    name: "Morning briefing",
    time: "08:00",
    goal: "Use only recall_memory (no web research). Give a 4-line morning briefing from my saved notes and reminders, naming each item by its type.",
  },
  {
    name: "Daily news check",
    time: "09:00",
    goal: "Research today's top 3 technology news headlines in one line each.",
  },
];

/** Autonomous tasks (multi-agent), live research and user-made automations. */
export default function TasksScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<string | null>(null);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [list, setList] = useState<Automation[]>(loadAutomations);
  const [name, setName] = useState("");
  const [time, setTime] = useState("08:00");
  const [autoGoal, setAutoGoal] = useState("");

  const store = (next: Automation[]) => {
    setList(next);
    saveAutomations(next);
  };

  const runTask = async () => {
    setBusy(true);
    setSteps([]);
    setResult(null);
    setError(null);
    try {
      setResult(await runAgentTask(goal.trim(), prefs.language, (s) => setSteps((x) => [...x, s])));
    } catch (e) {
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const runResearch = async () => {
    setBusy(true);
    setFound(null);
    try {
      const a = await research(query.trim(), prefs.language);
      setFound(
        `${a.text}\n\n(${costNote(a.source, a.costPaise)} · ${(a.latencyMs / 1000).toFixed(1)} s)`,
      );
    } catch (e) {
      setFound(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!prefs.features.tasks) {
    return <FeatureOff title="Agents & automations" name="Agents and automations" />;
  }

  return (
    <Page title="Agents & automations" kicker="AUTONOMOUS TASKS">
      <Card>
        <H2>Give the agents a task</H2>
        <Body muted size={13}>
          A planner splits the task; researcher, memory keeper, scheduler, translator and action
          agents do the steps; a writer answers. Phone actions always wait for your tap.
        </Body>
        <Field
          testID="task-goal-input"
          label="Task"
          value={goal}
          onChange={setGoal}
          multiline
          placeholder="Plan my Saturday: check the weather in Hyderabad, save a packing note and remind me at 7 pm"
        />
        <Btn
          testID="task-run-button"
          label="Run task"
          icon="agent"
          busy={busy}
          disabled={goal.trim() === ""}
          onPress={() => void runTask()}
        />
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        {steps.map((s, i) => (
          <Text
            key={i}
            testID="task-step"
            style={{
              color: s.status === "done" ? c.text : c.danger,
              fontFamily: FONTS.body,
              fontSize: 13,
            }}
          >
            {s.status === "done" ? "✓" : "✕"} {s.agent}: {s.summary}
          </Text>
        ))}
        {result === null ? null : (
          <View style={{ gap: 8 }}>
            <View
              testID="task-answer"
              style={{ backgroundColor: c.surface2, borderRadius: 14, padding: 12 }}
            >
              <Body>{result.answer}</Body>
            </View>
            <Body muted size={12}>
              {costNote(result.source, result.costPaise)}
            </Body>
            {result.actions.map((a) => (
              <Btn
                key={a.url}
                testID="task-action"
                label={`Confirm: ${a.label}`}
                tone="ghost"
                icon="bolt"
                onPress={() => void confirmAction(a)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card>
        <H2>Live internet research</H2>
        <Body muted size={13}>
          Searches the web through the broker with zero data retention. About ₹2.3 per search,
          inside the ₹500 monthly cap.
        </Body>
        <Field
          testID="research-input"
          label="Question"
          value={query}
          onChange={setQuery}
          placeholder="Best time to visit Araku valley?"
        />
        <Row>
          <Btn
            testID="research-button"
            label="Search the web"
            icon="search"
            busy={busy}
            disabled={query.trim() === ""}
            onPress={() => void runResearch()}
          />
          {found === null ? null : (
            <Btn
              label="Save"
              tone="ghost"
              icon="bookmark"
              onPress={() =>
                void saveItem({
                  kind: "answer",
                  title: `Research: ${query.slice(0, 50)}`,
                  text: found,
                }).catch((e: unknown) => setError(memoryErrorText(e)))
              }
            />
          )}
        </Row>
        {found === null ? null : (
          <Notice testID="research-answer" tone="info">
            {found}
          </Notice>
        )}
      </Card>

      <Card>
        <H2>Automations</H2>
        <Body muted size={13}>
          Run once a day at the time you set, while LensMate is open. Results are saved to Memory
          and shown as a notification.
        </Body>
        {list.length === 0 ? <Body muted>No automations yet.</Body> : null}
        {list.map((a) => (
          <View
            key={a.id}
            testID="automation-item"
            style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}
          >
            <View>
              <Body>
                {a.name} · {a.time}
              </Body>
              <Body muted size={12}>
                {a.goal}
              </Body>
            </View>
            <Row>
              <Switch
                accessibilityRole="switch"
                accessibilityLabel={`${a.name} enabled`}
                aria-checked={a.enabled}
                value={a.enabled}
                onValueChange={(v) =>
                  store(list.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))
                }
              />
              <Btn
                label="Run now"
                tone="ghost"
                busy={busy}
                onPress={() => {
                  setBusy(true);
                  void runAutomation(a)
                    .then((t) => setAutoResult(t))
                    .catch((e: unknown) => setAutoResult(aiErrorText(e)))
                    .finally(() => {
                      setBusy(false);
                      setList(loadAutomations());
                    });
                }}
              />
              <Btn
                label="Delete"
                tone="ghost"
                icon="trash"
                onPress={() => store(list.filter((x) => x.id !== a.id))}
              />
            </Row>
          </View>
        ))}
        {autoResult === null ? null : (
          <Notice testID="automation-result" tone="info">
            {autoResult}
          </Notice>
        )}
        <Row>
          {TEMPLATES.map((t) => (
            <Btn
              key={t.name}
              testID={`automation-template-${t.time}`}
              label={`+ ${t.name}`}
              tone="ghost"
              onPress={() => store([...list, { ...t, id: crypto.randomUUID(), enabled: true }])}
            />
          ))}
        </Row>
        <Field testID="automation-name-input" label="Name" value={name} onChange={setName} />
        <Field
          testID="automation-time-input"
          label="Time (HH:MM)"
          value={time}
          onChange={setTime}
        />
        <Field
          testID="automation-goal-input"
          label="What should the agents do?"
          value={autoGoal}
          onChange={setAutoGoal}
        />
        <Btn
          testID="automation-add-button"
          label="Add automation"
          icon="bolt"
          disabled={name.trim() === "" || autoGoal.trim() === "" || !/^\d{2}:\d{2}$/.test(time)}
          onPress={() => {
            store([
              ...list,
              {
                id: crypto.randomUUID(),
                name: name.trim(),
                time,
                goal: autoGoal.trim(),
                enabled: true,
              },
            ]);
            setName("");
            setAutoGoal("");
          }}
        />
      </Card>
      <Notice tone="warn">
        Not built, by design: control of a computer, payments, background camera or microphone, and
        scene-watching companion mode. These need owner decisions and are outside the v9 P-1 scope
        (see Profile → Later phases).
      </Notice>
    </Page>
  );
}
