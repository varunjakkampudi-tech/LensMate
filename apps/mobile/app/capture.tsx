import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { aiErrorText, askVision } from "../src/ai/assistant";
import { speak, stopSpeaking } from "../src/ai/speech";
import { CameraPreview, pickImageFile, type CameraHandle } from "../src/capture/camera";
import { memoryErrorText, saveItem } from "../src/memory/vault";
import { SeeSession, type SeeAnswer, type SeeState } from "../src/see/session";
import { useCapture } from "../src/ui/capture-session";
import { Icon } from "../src/ui/icon";
import { Btn, Card, Field, Notice } from "../src/ui/kit";
import { usePrefs, type Prefs } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

interface Answer {
  readonly title: string;
  readonly text: string;
  readonly followups: readonly string[];
  readonly meta: string;
}

const FORMAT =
  'Reply with JSON only: {"title": short name of the main subject, "answer": 2-4 sentences, "followups": [3 short follow-up questions the user may ask next]}.';

interface Parsed {
  readonly title: string;
  readonly text: string;
  readonly followups: readonly string[];
}

function parse(raw: string): Parsed {
  try {
    const j = JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? "") as {
      title?: unknown;
      answer?: unknown;
      followups?: unknown;
    };
    return {
      title: typeof j.title === "string" ? j.title : "Answer",
      text: typeof j.answer === "string" ? j.answer : raw,
      followups: Array.isArray(j.followups)
        ? j.followups.filter((f): f is string => typeof f === "string").slice(0, 3)
        : [],
    };
  } catch {
    return { title: "Answer", text: raw, followups: [] };
  }
}

/** "MOCK" is shown whenever no AI provider was paid for this answer. */
function metaOf(a: SeeAnswer): string {
  return `${a.source === "mock" ? "MOCK · " : ""}${(a.latencyMs / 1000).toFixed(1)} s · ₹${(a.costPaise / 100).toFixed(2)}`;
}

/** See – Photo & Ask: capture or upload, ask, follow up, read aloud, save. Mistake checks live under More. */
export default function CaptureScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const capture = useCapture();
  const camera = useRef<CameraHandle>(null);
  const token = useRef(0);
  // Refs keep the session's callbacks current without rebuilding the session on every render.
  const prefsRef = useRef<Prefs>(prefs);
  prefsRef.current = prefs;
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const sessionRef = useRef<SeeSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = new SeeSession({
      startCamera: () => {
        token.current = captureRef.current.begin("camera", "Photo & Ask", () =>
          sessionRef.current?.cancelCamera(),
        );
      },
      capture: () => camera.current?.capture() ?? Promise.resolve(null),
      releaseCamera: () => captureRef.current.end(token.current),
      ask: async (image, question, signal): Promise<SeeAnswer> => {
        const p = prefsRef.current;
        const a = await askVision(question, image, p.language, p.detailedDescriptions);
        if (signal.aborted) {
          throw new Error("cancelled");
        }
        return { text: a.text, source: a.source, costPaise: a.costPaise, latencyMs: a.latencyMs };
      },
      speak: (text, onDone) => {
        const p = prefsRef.current;
        speak(parse(text).text, p.language, p.voiceRate, onDone);
      },
      stopSpeech: () => stopSaying(),
      errorText: (e) => aiErrorText(e),
    });
  }
  const session = sessionRef.current;

  const [see, setSee] = useState<SeeState>(session.state);
  const [question, setQuestion] = useState("");
  const [saved, setSaved] = useState(false);
  const [more, setMore] = useState(false);
  const [checks, setChecks] = useState("Is the stove switched off?\nIs the door locked?");

  useEffect(() => session.subscribe(setSee), [session]);
  // Leaving the screen stops speech and any request, and releases the camera.
  useEffect(() => () => session.end(), [session]);

  // The answer's own parse happens once per answer, not on every render.
  const answer: Answer | null = useMemo(() => {
    if (see.answer === null) {
      return null;
    }
    const p = parse(see.answer.text);
    return { title: p.title, text: p.text, followups: p.followups, meta: metaOf(see.answer) };
  }, [see.answer]);

  // A new answer is unsaved, and reads aloud when the user has chosen auto-speak.
  useEffect(() => {
    setSaved(false);
    if (see.phase === "answered" && see.answer !== null && prefs.autoSpeak) {
      session.speak();
    }
    // Only a new answer triggers this; re-renders must not read it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [see.answer]);

  const photo = see.photo;
  const live = see.phase === "previewing";
  const busy = see.phase === "thinking";
  const [saveError, setSaveError] = useState<string | null>(null);
  const error = see.message ?? saveError;

  const onCamError = (m: string) => session.reportCameraError(m);

  const ask = (q: string, checkMode = false) => {
    if (q.trim() === "") {
      return;
    }
    const prompt = checkMode
      ? `Check this image against each check. For each: '<check> — Looks fine | Possible issue | Can't tell — reason, confidence low/medium/high'. Information only, never a safety guarantee. Put the lines in "answer". ${FORMAT}\nChecks:\n${checks}`
      : `${q}\n\n${FORMAT}`;
    void session.ask(prompt);
  };

  const pill = (
    label: string,
    icon: "speaker" | "bookmark" | "more",
    onPress: () => void,
    testID: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: c.surface,
      }}
    >
      <Icon name={icon} color={icon === "speaker" ? c.accent : c.text} size={16} />
      <Text
        style={{
          color: icon === "speaker" ? c.accent : c.text,
          fontFamily: FONTS.body,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}
    >
      {!prefs.features.vision ? (
        <Notice tone="warn">Vision help is switched off in Profile → Features.</Notice>
      ) : null}
      <View
        style={{
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: c.surface2,
          minHeight: 200,
          justifyContent: "center",
        }}
      >
        {live ? <CameraPreview ref={camera} onError={onCamError} /> : null}
        {!live && photo !== null ? (
          <Image
            testID="captured-photo"
            source={{ uri: photo }}
            style={{ width: "100%", aspectRatio: 16 / 10 }}
            resizeMode="cover"
          />
        ) : null}
        {!live && photo === null ? (
          <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
            <Icon name="camera" color={c.accent} size={36} />
            <Text style={{ color: c.muted, fontFamily: FONTS.body, textAlign: "center" }}>
              Take a photo or upload one. The camera runs only while this view is open.
            </Text>
          </View>
        ) : null}
        {photo !== null && !live ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            testID="remove-photo"
            onPress={() => session.removePhoto()}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" color="#fff" size={16} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {live ? (
          <>
            <Btn
              testID="take-photo-button"
              label="Take photo"
              icon="camera"
              onPress={() => void session.takePhoto()}
            />
            <Btn label="Cancel" tone="ghost" onPress={() => session.cancelCamera()} />
          </>
        ) : (
          <Btn
            testID="start-camera-button"
            label={photo === null ? "Camera" : "Retake"}
            icon="camera"
            disabled={!prefs.features.vision}
            onPress={() => session.start()}
          />
        )}
        {!live ? (
          <Btn
            testID="upload-photo-button"
            label="Upload"
            tone="ghost"
            icon="upload"
            disabled={!prefs.features.vision}
            onPress={() => pickImageFile((d) => session.setPhoto(d))}
          />
        ) : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: c.surface,
          borderRadius: 16,
          paddingLeft: 14,
          padding: 6,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <TextInput
          testID="vision-question-input"
          accessibilityLabel="Your question"
          value={question}
          onChangeText={setQuestion}
          placeholder="What is this? Is it good for indoors?"
          placeholderTextColor={c.muted}
          onSubmitEditing={() => ask(question)}
          style={{ flex: 1, color: c.text, fontFamily: FONTS.body, fontSize: 14, minHeight: 40 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          testID="vision-ask-button"
          disabled={busy || photo === null || question.trim() === ""}
          onPress={() => ask(question)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: c.accent,
            opacity: busy || photo === null || question.trim() === "" ? 0.45 : 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="send" color="#fff" size={18} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["Describe what you see", "Read all the text"].map((q) => (
          <Pressable
            key={q}
            accessibilityRole="button"
            testID={`quick-${q.split(" ")[0]?.toLowerCase()}`}
            disabled={photo === null || busy}
            onPress={() => ask(q)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              opacity: photo === null ? 0.5 : 1,
            }}
          >
            <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 13 }}>{q}</Text>
          </Pressable>
        ))}
      </View>
      {busy ? <Text style={{ color: c.muted, fontFamily: FONTS.body }}>Looking…</Text> : null}
      {error === null ? null : (
        <Notice testID="vision-error" tone="error">
          {error}
        </Notice>
      )}

      {answer === null ? null : (
        <View style={{ backgroundColor: c.surface2, borderRadius: 18, padding: 12, gap: 12 }}>
          <Card style={{ flexDirection: "row", gap: 12, padding: 12 }}>
            {photo === null ? null : (
              <Image source={{ uri: photo }} style={{ width: 64, height: 72, borderRadius: 10 }} />
            )}
            <View testID="vision-answer" style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  color: c.text,
                  fontFamily: FONTS.display,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                {answer.title}
              </Text>
              <Text
                style={{
                  color: c.muted,
                  fontFamily: FONTS.body,
                  fontSize: prefs.largeCaptions ? 18 : 13,
                  lineHeight: prefs.largeCaptions ? 26 : 19,
                }}
              >
                {answer.text}
              </Text>
              <Text style={{ color: c.muted, fontSize: 11 }}>{answer.meta}</Text>
            </View>
          </Card>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {pill(
              see.phase === "speaking" ? "Stop" : "Read Aloud",
              "speaker",
              () => (see.phase === "speaking" ? session.interrupt() : session.speak()),
              "read-aloud-button",
            )}
            {pill(
              saved ? "Saved" : "Save",
              "bookmark",
              () =>
                void saveItem({
                  kind: "capture",
                  title: answer.title,
                  text: answer.text,
                  ...(photo === null ? {} : { imageDataUrl: photo }),
                })
                  .then(() => {
                    setSaved(true);
                    setSaveError(null);
                  })
                  .catch((e: unknown) => setSaveError(memoryErrorText(e))),
              "save-capture-button",
            )}
            {pill("More", "more", () => setMore(!more), "more-button")}
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {answer.followups.map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                testID="followup-chip"
                disabled={busy}
                onPress={() => ask(f)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: c.surface,
                }}
              >
                <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 13 }}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {more || (answer === null && photo !== null) ? (
        <Card>
          <Text style={{ color: c.text, fontFamily: FONTS.display, fontWeight: "700" }}>
            Mistake checks
          </Text>
          <Field
            testID="vision-checks-input"
            label="Your checks, one per line"
            value={checks}
            onChange={setChecks}
            multiline
          />
          <Btn
            testID="run-checks-button"
            label="Run checks"
            icon="check"
            tone="ghost"
            busy={busy}
            disabled={photo === null || checks.trim() === ""}
            onPress={() => ask("checks", true)}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

/** Stops read-aloud on the phone and the web (the speech module decides which). */
function stopSaying(): void {
  stopSpeaking();
}
