import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isCapturing } from "@lensmate/core";
import { SCENES, sceneById, type QuestionId } from "./demo-catalogue";
import { SceneArt } from "./demo-scene-art";
import { DEMO } from "./demo-strings";
import {
  DEMO_SCENARIOS,
  budgetFraction,
  indicatorText,
  isBusy,
  summarizeLog,
  visibleAnswer,
  type DemoErrorCode,
  type DemoPhase,
  type DemoState,
} from "./demo-model";
import { useDemoSession, type DemoSession } from "./use-demo-session";

export interface DemoScreenProps {
  /** Returns to the home screen. */
  readonly onBack: () => void;
}

/**
 * The SEE-HEAR-TALK demo screen. Every value shown comes from the demo state, which runs on core's glasses
 * rules, the spend cap and a mock provider. It is labelled as synthetic and mock throughout (Standards section 3).
 */
export function DemoScreen({ onBack }: DemoScreenProps) {
  const session = useDemoSession();
  return <DemoView session={session} onBack={onBack} />;
}

interface DemoViewProps {
  readonly session: DemoSession;
  readonly onBack: () => void;
}

function DemoView({ session, onBack }: DemoViewProps) {
  const { state } = session;
  const busy = isBusy(state);
  const holding = isCapturing(state.glasses);
  const scene = state.sceneId === null ? null : sceneById(state.sceneId);
  const hasScene = scene !== null;
  const counts = summarizeLog(state.log);
  const fraction = budgetFraction(state.budget);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {DEMO.title}
      </Text>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{DEMO.banner}</Text>
      </View>
      <Text style={styles.body}>{DEMO.intro}</Text>
      <Text style={styles.body}>{DEMO.simulatedNote}</Text>

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.indicatorTitle}
      </Text>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <Text testID="indicator" style={styles.statusText}>
          {indicatorText(state)}
        </Text>
      </View>

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.scenarioGroup}
      </Text>
      <Text style={styles.body}>{DEMO.scenarioHint}</Text>
      <View accessibilityRole="radiogroup" style={styles.column}>
        {DEMO_SCENARIOS.map((scenario) => (
          <ChoiceButton
            key={scenario}
            label={DEMO.scenarios[scenario]}
            selected={state.scenario === scenario}
            disabled={busy}
            onPress={() => {
              session.chooseScenario(scenario);
            }}
            role="radio"
          />
        ))}
      </View>

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.seeTitle}
      </Text>
      <View style={styles.column}>
        {SCENES.map((item) => (
          <ChoiceButton
            key={item.id}
            label={DEMO.scenes[item.id].title}
            selected={state.sceneId === item.id}
            disabled={busy}
            onPress={() => {
              session.chooseScene(item.id);
            }}
          />
        ))}
      </View>
      {scene === null ? (
        <Text style={styles.body}>{DEMO.pickScene}</Text>
      ) : (
        <>
          <Text style={styles.label}>{DEMO.sceneLabel}</Text>
          <SceneArt scene={scene} description={DEMO.scenes[scene.id].description} />
          <Text style={styles.body}>{DEMO.scenes[scene.id].description}</Text>
        </>
      )}
      <ChoiceButton
        label={DEMO.photo}
        disabled={!hasScene || busy || holding || state.photoCapture}
        onPress={() => {
          session.takePhoto();
        }}
      />
      {!hasScene ? <Text style={styles.body}>{DEMO.photoNeedsScene}</Text> : null}
      {state.photos > 0 ? <Text style={styles.body}>{DEMO.photoTaken(state.photos)}</Text> : null}

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.hearTitle}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={DEMO.holdToAsk}
        accessibilityState={{ disabled: !hasScene || busy || state.photoCapture }}
        disabled={!hasScene || busy || state.photoCapture}
        onPressIn={() => {
          session.holdStart();
        }}
        onPressOut={() => {
          session.holdEnd();
        }}
        style={[
          styles.button,
          !hasScene || busy || state.photoCapture ? styles.buttonDisabled : null,
        ]}
      >
        <Text style={styles.buttonText}>{DEMO.holdToAsk}</Text>
      </Pressable>
      <Text style={styles.body}>{DEMO.holdHint}</Text>
      {scene === null
        ? null
        : scene.questionIds.map((questionId) => (
            <ChoiceButton
              key={questionId}
              label={DEMO.questions[questionId]}
              disabled={busy || holding || state.photoCapture}
              onPress={() => {
                session.askQuestion(questionId);
              }}
            />
          ))}
      {state.questionId === null ? null : <Transcript questionId={state.questionId} />}

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.talkTitle}
      </Text>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          {state.phase === "PROCESSING" ? (
            <ActivityIndicator accessibilityLabel={DEMO.statusProcessing} />
          ) : null}
          <Text style={styles.statusText}>{statusText(state.phase)}</Text>
        </View>
      </View>
      {busy ? <Text style={styles.body}>{DEMO.busyLocked}</Text> : null}
      <AnswerBlock state={state} />
      {state.glasses.speaking ? (
        <ChoiceButton
          label={DEMO.stop}
          onPress={() => {
            session.stop();
          }}
        />
      ) : null}
      {state.stopSimulatedMs === null ? null : (
        <Text style={styles.body}>{DEMO.stopTiming(state.stopSimulatedMs)}</Text>
      )}
      {state.phase === "ERROR" && state.error !== null ? (
        <ErrorBlock
          code={state.error}
          onRetry={() => {
            session.retry();
          }}
          onBack={() => {
            session.back();
          }}
        />
      ) : null}

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.budgetTitle}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={DEMO.budgetTitle}
        accessibilityValue={{ min: 0, max: state.budget.capMinor, now: state.budget.spentMinor }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: `${String(Math.round(fraction * 100))}%` }]} />
      </View>
      <Text style={styles.body}>
        {DEMO.budgetLine(state.budget.spentMinor, state.budget.capMinor)}
      </Text>

      <Text accessibilityRole="header" style={styles.subtitle}>
        {DEMO.logTitle}
      </Text>
      <Text style={styles.body}>
        {DEMO.logLine(counts.photos, counts.questions, counts.answers, counts.stops, counts.errors)}
      </Text>

      <ChoiceButton label={DEMO.back} onPress={onBack} />
    </ScrollView>
  );
}

function statusText(phase: DemoPhase): string {
  switch (phase) {
    case "IDLE":
      return DEMO.statusIdle;
    case "PROCESSING":
      return DEMO.statusProcessing;
    case "STREAMING":
      return DEMO.statusStreaming;
    case "PLAYING":
      return DEMO.statusPlaying;
    case "STOPPED":
      return DEMO.statusStopped;
    case "DONE":
      return DEMO.statusDone;
    case "ERROR":
      return DEMO.errorTitle;
  }
}

function Transcript({ questionId }: { readonly questionId: QuestionId }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{DEMO.transcriptLabel}</Text>
      <Text style={styles.body}>{DEMO.questions[questionId]}</Text>
      <Text style={styles.note}>{DEMO.transcriptNote}</Text>
    </View>
  );
}

function AnswerBlock({ state }: { readonly state: DemoState }) {
  if (state.answer === null) {
    return <Text style={styles.body}>{DEMO.answerEmpty}</Text>;
  }
  return (
    <View style={styles.card} accessibilityLiveRegion="polite" testID="answer">
      <Text style={styles.label}>{state.answer.label}</Text>
      <Text style={styles.answer}>{visibleAnswer(state)}</Text>
    </View>
  );
}

function ErrorBlock({
  code,
  onRetry,
  onBack,
}: {
  readonly code: DemoErrorCode;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}) {
  const canRetry = code !== "CAP_REACHED";
  return (
    <View style={styles.errorCard}>
      <Text accessibilityRole="alert" style={styles.error}>
        {DEMO.errors[code]}
      </Text>
      {canRetry ? <ChoiceButton label={DEMO.retry} onPress={onRetry} /> : null}
      <ChoiceButton label={DEMO.backToQuestions} onPress={onBack} />
    </View>
  );
}

interface ChoiceButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly role?: "button" | "radio";
}

function ChoiceButton({
  label,
  onPress,
  disabled = false,
  selected = false,
  role = "button",
}: ChoiceButtonProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={
        role === "radio" ? { checked: selected, disabled } : { selected, disabled }
      }
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        disabled ? styles.buttonDisabled : null,
        selected ? styles.buttonSelected : null,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  subtitle: { fontSize: 18, fontWeight: "600", marginTop: 8 },
  label: { fontSize: 14, fontWeight: "600", color: "#1f4e79" },
  body: { fontSize: 16 },
  note: { fontSize: 14, color: "#4a4a4a" },
  banner: { padding: 12, borderRadius: 8, backgroundColor: "#fff3cd" },
  bannerText: { fontSize: 16, fontWeight: "600", color: "#4a3500" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  column: { gap: 8 },
  status: { minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#1f4e79" },
  statusText: { fontSize: 18 },
  card: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#c5d3e0", gap: 6 },
  answer: { fontSize: 18 },
  errorCard: { padding: 12, borderRadius: 8, gap: 8, backgroundColor: "#fbeaea" },
  error: { fontSize: 16, color: "#8a1c1c" },
  track: { height: 16, borderRadius: 8, backgroundColor: "#dfe6ee", overflow: "hidden" },
  fill: { height: 16, backgroundColor: "#1f4e79" },
  button: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1f4e79",
  },
  buttonSelected: { borderWidth: 3, borderColor: "#0b2238" },
  buttonDisabled: { backgroundColor: "#7a8a99" },
  buttonText: { color: "#ffffff", fontSize: 17, fontWeight: "600", textAlign: "center" },
});
