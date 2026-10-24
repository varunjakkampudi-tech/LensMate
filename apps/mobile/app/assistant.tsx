import { router } from "expo-router";
import { createElement, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { confirmAction, runAgentTask, type AgentStep, type PhoneAction } from "../src/ai/agent";
import { aiErrorText } from "../src/ai/assistant";
import { speak, stopSpeaking } from "../src/ai/speech";
import { useMicSession } from "../src/ai/use-voice";
import { Icon, type IconName } from "../src/ui/icon";
import { Btn, Card, Chip, Field, Notice } from "../src/ui/kit";
import { usePrefs, type Lang } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

function Orb({ active }: { active: boolean }) {
  if (Platform.OS !== "web") {
    return (
      <View style={{ width: 170, height: 170, borderRadius: 85, backgroundColor: "#3B82F6" }} />
    );
  }
  const wave = "M20 60 Q30 40 40 60 T60 60 T80 60 T100 60 M28 60 Q34 30 44 60 T64 60 T84 60";
  return createElement(
    "div",
    {
      "aria-hidden": true,
      style: {
        width: 180,
        height: 180,
        borderRadius: 90,
        background: "radial-gradient(circle at 35% 30%, #93C5FD, #2563EB 55%, #1E3A8A)",
        boxShadow: active
          ? "0 0 0 18px rgba(59,130,246,0.15), 0 0 0 36px rgba(59,130,246,0.08)"
          : "0 0 0 12px rgba(59,130,246,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "box-shadow 400ms ease",
      },
    },
    createElement(
      "svg",
      { width: 120, height: 120, viewBox: "0 0 120 120", fill: "none" },
      createElement("path", {
        d: wave,
        stroke: "rgba(255,255,255,0.9)",
        strokeWidth: 2.5,
        strokeLinecap: "round",
      }),
    ),
  );
}

const AGENT_ICON: Record<AgentStep["agent"], IconName> = {
  Planner: "agent",
  Researcher: "search",
  "Memory keeper": "brain",
  Scheduler: "bell",
  "Action agent": "bolt",
  Translator: "globe",
  Writer: "note",
};

/** Hear & Talk: speak or type; the multi-agent assistant answers aloud and can research, remember and propose actions. */
export default function AssistantScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const [lang, setLang] = useState<Lang>(prefs.language);
  const mic = useMicSession("Voice question");
  const [typed, setTyped] = useState("");
  const [goal, setGoal] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [actions, setActions] = useState<readonly PhoneAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const run = async (text: string) => {
    setGoal(text);
    setSteps([]);
    setAnswer(null);
    setActions([]);
    setError(null);
    setBusy(true);
    try {
      const r = await runAgentTask(text, lang, (s) => setSteps((x) => [...x, s]));
      setAnswer(r.answer);
      setActions(r.actions);
      setSpeaking(true);
      speak(r.answer, lang, prefs.voiceRate, () => setSpeaking(false));
    } catch (e) {
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const status =
    mic.listening !== null
      ? "Listening..."
      : busy
        ? "Thinking..."
        : speaking
          ? "Speaking..."
          : "Tap to talk";
  const action = (label: string, icon: IconName, onPress: () => void, testID: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        gap: 6,
        backgroundColor: c.surface,
        borderRadius: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Icon name={icon} color={c.text} size={24} />
      <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40, alignItems: "stretch" }}
    >
      {!prefs.features.talk ? (
        <Notice tone="warn">Voice questions are switched off in Profile → Features.</Notice>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mic.listening !== null ? "Stop listening" : "Start listening"}
        testID="talk-mic-button"
        disabled={busy || !prefs.features.talk}
        onPress={() => (mic.listening !== null ? mic.stop() : mic.start(lang, (t) => void run(t)))}
        style={{ alignItems: "center", paddingTop: 12 }}
      >
        <Orb active={mic.listening !== null || speaking} />
      </Pressable>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text
          testID="talk-status"
          style={{ color: c.text, fontFamily: FONTS.display, fontSize: 22, fontWeight: "800" }}
        >
          {status}
        </Text>
        <Text
          testID="talk-partial"
          style={{
            color: c.muted,
            fontFamily: FONTS.body,
            fontSize: prefs.largeCaptions ? 20 : 14,
            textAlign: "center",
          }}
        >
          {mic.partial !== "" ? mic.partial : "Speak naturally. You can ask anything."}
        </Text>
      </View>
      {mic.listening !== null || speaking ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop"
          testID="talk-interrupt-button"
          onPress={() => {
            mic.stop();
            stopSpeaking();
            setSpeaking(false);
          }}
          style={{ alignSelf: "center", alignItems: "center", gap: 4 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: c.danger,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: "#fff" }} />
          </View>
          <Text style={{ color: c.danger, fontWeight: "600", fontSize: 12 }}>Stop</Text>
        </Pressable>
      ) : null}
      {mic.error === null ? null : <Notice tone="error">{mic.error}</Notice>}
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
        <Chip
          testID="talk-lang-en"
          label="English"
          active={lang === "en"}
          onPress={() => setLang("en")}
        />
        <Chip
          testID="talk-lang-te"
          label="తెలుగు"
          active={lang === "te"}
          onPress={() => setLang("te")}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {action("Ask", "pin", () => mic.start(lang, (t) => void run(t)), "action-ask")}
        {action("Translate", "globe", () => router.push("/translate"), "action-translate")}
        {action("Take Photo", "camera", () => router.push("/capture"), "action-photo")}
      </View>
      <Card>
        <Field
          testID="talk-typed-input"
          label="Or type a question or a task"
          value={typed}
          onChange={setTyped}
          placeholder="Find tomorrow's weather in Hyderabad and remind me at 8 to carry an umbrella"
        />
        <Btn
          testID="talk-send-button"
          label="Ask the assistant"
          icon="spark"
          busy={busy}
          disabled={typed.trim() === "" || !prefs.features.talk}
          onPress={() => {
            const t = typed.trim();
            setTyped("");
            void run(t);
          }}
        />
      </Card>
      {error === null ? null : (
        <Notice testID="talk-error" tone="error">
          {error}
        </Notice>
      )}
      {goal === null ? null : (
        <Card>
          <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 13 }}>You: {goal}</Text>
          {steps.map((s, i) => (
            <View
              key={i}
              testID="agent-step"
              style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
            >
              <Icon
                name={AGENT_ICON[s.agent]}
                color={s.status === "done" ? c.accent : c.danger}
                size={18}
              />
              <Text style={{ flex: 1, color: c.text, fontFamily: FONTS.body, fontSize: 13 }}>
                <Text style={{ fontWeight: "700" }}>{s.agent}: </Text>
                {s.summary}
              </Text>
            </View>
          ))}
          {answer === null ? null : (
            <View
              testID="talk-turn-assistant"
              style={{ backgroundColor: c.surface2, borderRadius: 14, padding: 12 }}
            >
              <Text
                style={{
                  color: c.text,
                  fontFamily: FONTS.body,
                  fontSize: prefs.largeCaptions ? 20 : 15,
                  lineHeight: prefs.largeCaptions ? 28 : 22,
                }}
              >
                {answer}
              </Text>
            </View>
          )}
          {actions.map((a) => (
            <Btn
              key={a.url}
              testID="agent-action"
              label={`Confirm: ${a.label}`}
              tone="ghost"
              icon="bolt"
              onPress={() => void confirmAction(a)}
            />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
