import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { aiErrorText, askVision, translate, LANG_NAME } from "../src/ai/assistant";
import { hasVoiceFor, speak } from "../src/ai/speech";
import { startsNewSession } from "../src/ai/session";
import { useMicSession } from "../src/ai/use-voice";
import { pickImageFile } from "../src/capture/camera";
import { saveItem } from "../src/memory/vault";
import { Icon, type IconName } from "../src/ui/icon";
import { Btn, Field, Notice } from "../src/ui/kit";
import { LangPicker } from "../src/ui/lang-picker";
import { usePrefs, type Lang } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

const ANNOUNCEMENT = {
  en: "This conversation is being translated by LensMate. Please speak one at a time.",
  te: "ఈ సంభాషణను LensMate అనువదిస్తోంది. దయచేసి ఒక్కొక్కరుగా మాట్లాడండి.",
};

function Marked({
  text,
  uncertain,
  size,
  color,
  warn,
}: {
  text: string;
  uncertain: readonly string[];
  size: number;
  color: string;
  warn: string;
}) {
  if (uncertain.length === 0) {
    return (
      <Text style={{ color, fontFamily: FONTS.body, fontSize: size, lineHeight: size * 1.45 }}>
        {text}
      </Text>
    );
  }
  const pattern = new RegExp(
    `(${uncertain.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );
  return (
    <Text style={{ color, fontFamily: FONTS.body, fontSize: size, lineHeight: size * 1.45 }}>
      {text.split(pattern).map((part, i) => (
        <Text
          key={i}
          style={
            uncertain.includes(part)
              ? { color: warn, textDecorationLine: "underline", textDecorationStyle: "dotted" }
              : undefined
          }
        >
          {part}
        </Text>
      ))}
    </Text>
  );
}

export default function TranslateScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const mic = useMicSession("Translation session");
  const [from, setFrom] = useState<Lang>("en");
  const [to, setTo] = useState<Lang>("te");
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [announced, setAnnounced] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; uncertain: readonly string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [typed, setTyped] = useState("");
  const [savedNote, setSavedNote] = useState(false);
  const size = prefs.largeCaptions ? 26 : 20;

  // A translation session starts with the first request, and ends after two minutes without one (v9 section 21).
  // Every session starts with the spoken announcement (G15), not only the first one on this screen.
  const lastRequest = useRef<number | null>(null);
  const announce = () => {
    const now = Date.now();
    const startsSession = startsNewSession(lastRequest.current, now);
    lastRequest.current = now;
    setAnnounced(true);
    if (startsSession) {
      speak(ANNOUNCEMENT.en, "en", prefs.voiceRate, () =>
        from === "te" || to === "te" ? speak(ANNOUNCEMENT.te, "te", prefs.voiceRate) : undefined,
      );
    }
  };

  const run = async (text: string) => {
    setOriginal(text);
    setBusy(true);
    setError(null);
    try {
      const r = await translate(text, from, to);
      setResult({ text: r.translation, uncertain: r.uncertain });
      setSavedNote(false);
      if (prefs.autoSpeak || hasVoiceFor(to)) {
        speak(r.translation, to, prefs.voiceRate);
      }
    } catch (e) {
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const fromPhoto = () =>
    pickImageFile((d) => {
      if (d === null) {
        return;
      }
      setBusy(true);
      setOriginal("Text in photo");
      askVision(
        `Read the text in this image and translate it into ${LANG_NAME[to]}. Reply with only the translation.`,
        d,
        to,
        false,
      )
        .then((a) => setResult({ text: a.text, uncertain: [] }))
        .catch((e: unknown) => setError(aiErrorText(e)))
        .finally(() => setBusy(false));
    });

  const langBox = (lang: Lang, sub: string, testID: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sub} ${LANG_NAME[lang]}, change`}
      testID={testID}
      onPress={() => setPicking(sub.includes("speak") ? "from" : "to")}
      style={{
        flex: 1,
        backgroundColor: c.surface,
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 15, fontWeight: "700" }}>
        {LANG_NAME[lang]}
      </Text>
      <Text style={{ color: c.muted, fontSize: 11 }}>{sub}</Text>
    </Pressable>
  );
  const bottom = (label: string, icon: IconName, onPress: () => void, testID: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={{ alignItems: "center", gap: 6, width: 80 }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: c.surface,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <Icon name={icon} color={c.text} size={20} />
      </View>
      <Text style={{ color: c.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}
    >
      {!prefs.features.translate ? (
        <Notice tone="warn">Live translation is switched off in Profile → Features.</Notice>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {langBox(from, "(You speak)", "lang-from")}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap languages"
          testID="swap-languages"
          onPress={() => {
            setFrom(to);
            setTo(from);
            setResult(null);
            setOriginal(null);
          }}
        >
          <Icon name="swap" color={c.accent} size={24} />
        </Pressable>
        {langBox(to, "(Translate to)", "lang-to")}
      </View>
      {picking === null ? null : (
        <LangPicker
          prefix={`pick-${picking}`}
          value={picking === "from" ? from : to}
          onChange={(l) => {
            if (picking === "from") {
              setFrom(l);
            } else {
              setTo(l);
            }
            setPicking(null);
            setResult(null);
          }}
        />
      )}
      {announced ? null : (
        <Notice tone="info">
          The first time you speak, LensMate announces the translation to everyone in both
          languages.
        </Notice>
      )}
      <View
        style={{
          backgroundColor: c.tintBlue,
          borderRadius: 18,
          padding: 16,
          gap: 8,
          minHeight: 110,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: c.text, fontFamily: FONTS.body, fontWeight: "600" }}>
            You ({LANG_NAME[from]})
          </Text>
          {original === null ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Speak original"
              onPress={() => speak(original, from, prefs.voiceRate)}
            >
              <Icon name="speaker" color={c.accent} size={20} />
            </Pressable>
          )}
        </View>
        <Text
          testID="translate-partial"
          style={{ color: c.text, fontFamily: FONTS.body, fontSize: 16, lineHeight: 23 }}
        >
          {mic.partial !== ""
            ? mic.partial
            : (original ?? "Hold to speak, type, or use the camera.")}
        </Text>
      </View>
      <View
        testID="translate-caption"
        style={{
          backgroundColor: c.tintIndigo,
          borderRadius: 18,
          padding: 16,
          gap: 8,
          minHeight: 130,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: "#4F46E5", fontFamily: FONTS.body, fontWeight: "600" }}>
            Translation ({LANG_NAME[to]})
          </Text>
          {result === null ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Speak translation"
              testID="speak-translation"
              onPress={() => speak(result.text, to, prefs.voiceRate)}
            >
              <Icon name="speaker" color="#4F46E5" size={20} />
            </Pressable>
          )}
        </View>
        {busy ? (
          <Text style={{ color: c.muted }}>Translating…</Text>
        ) : result === null ? (
          <Text style={{ color: c.muted }}>The translation appears here.</Text>
        ) : (
          <Marked
            text={result.text}
            uncertain={result.uncertain}
            size={size}
            color={c.text}
            warn={c.accent2}
          />
        )}
        {result === null ? null : (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 14 }}>
            {Platform.OS === "web" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy translation"
                onPress={() => void navigator.clipboard.writeText(result.text)}
              >
                <Icon name="copy" color={c.muted} size={18} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save translation"
              testID="save-translation"
              onPress={() =>
                void saveItem({
                  kind: "note",
                  title: `Translation: ${(original ?? "").slice(0, 40)}`,
                  text: `${original ?? ""}\n→ ${result.text}`,
                }).then(() => setSavedNote(true))
              }
            >
              <Icon name="bookmark" color={savedNote ? c.accent : c.muted} size={18} />
            </Pressable>
            {savedNote ? (
              <Text testID="translation-saved" style={{ color: c.accent, fontSize: 12 }}>
                Saved
              </Text>
            ) : null}
          </View>
        )}
        {result !== null && result.uncertain.length > 0 ? (
          <Text style={{ color: c.muted, fontSize: 11 }}>
            Dotted words: the translator was unsure.
          </Text>
        ) : null}
      </View>
      {error === null ? null : (
        <Notice testID="translate-error" tone="error">
          {error}
        </Notice>
      )}
      {mic.error === null ? null : <Notice tone="error">{mic.error}</Notice>}
      {keyboard ? (
        <View style={{ gap: 8 }}>
          <Field
            testID="translate-typed-input"
            label={`Type in ${LANG_NAME[from]}`}
            value={typed}
            onChange={setTyped}
          />
          <Btn
            testID="translate-typed-button"
            label="Translate"
            icon="arrow"
            busy={busy}
            disabled={typed.trim() === ""}
            onPress={() => {
              announce();
              const t = typed.trim();
              setTyped("");
              void run(t);
            }}
          />
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
          paddingTop: 6,
        }}
      >
        {bottom("Keyboard", "keyboard", () => setKeyboard(!keyboard), "translate-keyboard")}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mic.listening !== null ? "Stop listening" : "Hold to speak"}
          testID="translate-speak"
          disabled={busy || !prefs.features.translate}
          onPress={() => {
            if (mic.listening !== null) {
              mic.stop();
            } else {
              announce();
              mic.start(from, (t) => void run(t));
            }
          }}
          style={{ alignItems: "center", gap: 6 }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: mic.listening !== null ? c.danger : c.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="mic" color="#fff" size={30} />
          </View>
          <Text style={{ color: c.text, fontSize: 12 }}>
            {mic.listening !== null ? `Listening (${LANG_NAME[mic.listening]})` : "Hold to speak"}
          </Text>
        </Pressable>
        {bottom("Camera", "camera", fromPhoto, "translate-camera")}
      </View>
      {hasVoiceFor(to) ? null : (
        <Text style={{ color: c.muted, fontSize: 11, textAlign: "center" }}>
          No {LANG_NAME[to]} voice in this browser: the translation is shown as captions.
        </Text>
      )}
    </ScrollView>
  );
}
