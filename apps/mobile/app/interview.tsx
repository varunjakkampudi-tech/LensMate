import { useState } from "react";
import { View } from "react-native";
import { speak } from "../src/ai/speech";
import { useConversation, useMicSession } from "../src/ai/use-voice";
import { saveItem } from "../src/memory/vault";
import { Body, Btn, Card, Chip, Field, H2, Notice, Page, Row } from "../src/ui/kit";
import { usePrefs } from "../src/ui/prefs";
import { useTheme } from "../src/ui/theme";

type Stage = "setup" | "practice";

const COACH =
  "You are an interview practice coach running a mock interview the user started for practice. Do not ask the user to confirm it is practice. " +
  "When asked to start, ask one realistic interview question at a time. After each candidate answer, give brief feedback " +
  "(one strength, one improvement, a 1–5 score) and then ask the next question.";

export default function InterviewScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const [role, setRole] = useState("Software engineer");
  const [kind, setKind] = useState("Mixed");
  const [stage, setStage] = useState<Stage>("setup");
  const [answer, setAnswer] = useState("");
  const [debrief, setDebrief] = useState<string | null>(null);
  const chat = useConversation(prefs.language, COACH);
  const mic = useMicSession("Interview practice");

  const say = async (text: string, hidden = false) => {
    const reply = await chat.send(text, hidden);
    if (reply !== null && prefs.autoSpeak) {
      speak(reply, prefs.language, prefs.voiceRate);
    }
  };

  const finish = async () => {
    const reply = await chat.send(
      "End the practice. Give a short debrief: overall score, top 3 strengths, top 3 things to practise, and 3 questions to prepare next time. If the candidate gave no answers, say so and do not score.",
      true,
    );
    if (reply !== null) {
      setDebrief(reply);
      await saveItem({ kind: "debrief", title: `Interview practice: ${role}`, text: reply });
    }
  };

  return (
    <Page title="Interview practice" kicker="PRACTICE ONLY">
      <Notice tone="warn">
        Practice and preparation only. LensMate never listens to or helps with a live interview
        (G16).
      </Notice>
      {stage === "setup" ? (
        <Card>
          <H2>Set up a mock interview</H2>
          <Field testID="interview-role-input" label="Role" value={role} onChange={setRole} />
          <Row>
            {["Mixed", "Behavioural", "Technical"].map((k) => (
              <Chip
                key={k}
                testID={`interview-kind-${k.toLowerCase()}`}
                label={k}
                active={kind === k}
                onPress={() => setKind(k)}
              />
            ))}
          </Row>
          <Btn
            testID="interview-start-button"
            label="Start practice"
            icon="user"
            disabled={role.trim() === ""}
            onPress={() => {
              setStage("practice");
              void say(
                `Start a ${kind.toLowerCase()} mock interview for the role: ${role}. Ask the first question.`,
                true,
              );
            }}
          />
        </Card>
      ) : (
        <>
          <Card>
            {chat.turns.map((t, i) => (
              <View
                key={i}
                testID={`interview-turn-${t.role}`}
                style={{
                  alignSelf: t.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  backgroundColor: t.role === "user" ? c.glow : c.surface2,
                  borderRadius: 16,
                  padding: 12,
                }}
              >
                <Body size={prefs.largeCaptions ? 20 : 15}>{t.content}</Body>
              </View>
            ))}
            {chat.busy ? <Body muted>Coach is thinking…</Body> : null}
            {chat.error === null ? null : <Notice tone="error">{chat.error}</Notice>}
          </Card>
          <Card>
            <Field
              testID="interview-answer-input"
              label="Your answer"
              value={mic.partial !== "" && mic.listening ? mic.partial : answer}
              onChange={setAnswer}
              multiline
            />
            <Row>
              <Btn
                testID="interview-mic-button"
                label={mic.listening ? "Stop" : "Answer by voice"}
                tone="ghost"
                icon="mic"
                onPress={() =>
                  mic.listening ? mic.stop() : mic.start(prefs.language, (t) => setAnswer(t))
                }
              />
              <Btn
                testID="interview-send-button"
                label="Send answer"
                icon="arrow"
                busy={chat.busy}
                disabled={answer.trim() === ""}
                onPress={() => {
                  const a = answer.trim();
                  setAnswer("");
                  void say(a);
                }}
              />
              <Btn
                testID="interview-finish-button"
                label="Finish and debrief"
                tone="ghost"
                icon="check"
                disabled={chat.busy}
                onPress={() => void finish()}
              />
            </Row>
          </Card>
          {debrief === null ? null : (
            <Card glow>
              <H2>Debrief (saved to Memory)</H2>
              <Body>{debrief}</Body>
              <Btn
                label="New practice"
                tone="ghost"
                onPress={() => {
                  chat.reset();
                  setDebrief(null);
                  setStage("setup");
                }}
              />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
