import { useCallback, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { aiErrorText, askVision } from "../src/ai/assistant";
import { speak, stopSpeaking } from "../src/ai/speech";
import { CameraPreview, pickImageFile, type CameraHandle } from "../src/capture/camera";
import { saveItem } from "../src/memory/vault";
import { useCapture } from "../src/ui/capture-session";
import { Icon } from "../src/ui/icon";
import { Btn, Card, Field, Notice } from "../src/ui/kit";
import { usePrefs } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

interface Answer {
  readonly title: string;
  readonly text: string;
  readonly followups: readonly string[];
  readonly meta: string;
}

const FORMAT =
  'Reply with JSON only: {"title": short name of the main subject, "answer": 2-4 sentences, "followups": [3 short follow-up questions the user may ask next]}.';

function parse(raw: string): Omit<Answer, "meta"> {
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

/** See – Photo & Ask: capture or upload, ask, follow up, read aloud, save. Mistake checks live under More. */
export default function CaptureScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const capture = useCapture();
  const camera = useRef<CameraHandle>(null);
  const token = useRef(0);
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [more, setMore] = useState(false);
  const [checks, setChecks] = useState("Is the stove switched off?\nIs the door locked?");

  const stopCam = useCallback(() => setLive(false), []);
  const onCamError = useCallback(
    (m: string) => {
      setError(m);
      setLive(false);
      capture.end(token.current);
    },
    [capture],
  );

  const setNewPhoto = (d: string) => {
    setPhoto(d);
    setAnswer(null);
    setSaved(false);
  };

  const ask = async (q: string, checkMode = false) => {
    if (photo === null || q.trim() === "") {
      return;
    }
    setBusy(true);
    setError(null);
    stopSpeaking();
    const prompt = checkMode
      ? `Check this image against each check. For each: '<check> — Looks fine | Possible issue | Can't tell — reason, confidence low/medium/high'. Information only, never a safety guarantee. Put the lines in "answer". ${FORMAT}\nChecks:\n${checks}`
      : `${q}\n\n${FORMAT}`;
    try {
      const a = await askVision(prompt, photo, prefs.language, prefs.detailedDescriptions);
      const p = parse(a.text);
      setAnswer({
        ...p,
        meta: `${a.source === "mock" ? "MOCK · " : ""}${(a.latencyMs / 1000).toFixed(1)} s · ₹${(a.costPaise / 100).toFixed(2)}`,
      });
      setSaved(false);
      if (prefs.autoSpeak) {
        speak(p.text, prefs.language, prefs.voiceRate);
      }
    } catch (e) {
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
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
            onPress={() => {
              setPhoto(null);
              setAnswer(null);
            }}
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
              onPress={() => {
                void (async () => {
                  const s = (await camera.current?.capture()) ?? null;
                  setLive(false);
                  capture.end(token.current);
                  if (s === null) {
                    setError("The camera was not ready. Try again.");
                  } else {
                    setNewPhoto(s);
                  }
                })();
              }}
            />
            <Btn
              label="Cancel"
              tone="ghost"
              onPress={() => {
                setLive(false);
                capture.end(token.current);
              }}
            />
          </>
        ) : (
          <Btn
            testID="start-camera-button"
            label={photo === null ? "Camera" : "Retake"}
            icon="camera"
            disabled={!prefs.features.vision}
            onPress={() => {
              setError(null);
              setLive(true);
              token.current = capture.begin("camera", "Photo & Ask", stopCam);
            }}
          />
        )}
        {!live ? (
          <Btn
            testID="upload-photo-button"
            label="Upload"
            tone="ghost"
            icon="upload"
            disabled={!prefs.features.vision}
            onPress={() =>
              pickImageFile((d) =>
                d === null ? setError("That file could not be read as an image.") : setNewPhoto(d),
              )
            }
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
          onSubmitEditing={() => void ask(question)}
          style={{ flex: 1, color: c.text, fontFamily: FONTS.body, fontSize: 14, minHeight: 40 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          testID="vision-ask-button"
          disabled={busy || photo === null || question.trim() === ""}
          onPress={() => void ask(question)}
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
            onPress={() => void ask(q)}
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
              "Read Aloud",
              "speaker",
              () => speak(answer.text, prefs.language, prefs.voiceRate),
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
                }).then(() => setSaved(true)),
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
                onPress={() => void ask(f)}
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
            onPress={() => void ask("checks", true)}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}
