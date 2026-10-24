import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { aiErrorText, askVision } from "../src/ai/assistant";
import { speak } from "../src/ai/speech";
import { CameraPreview, pickImageFile, type CameraHandle } from "../src/capture/camera";
import { useCapture } from "../src/ui/capture-session";
import { useGlasses } from "../src/ui/glasses";
import { Icon } from "../src/ui/icon";
import { usePrefs } from "../src/ui/prefs";
import { FONTS } from "../src/ui/theme";

const SAMPLE_SCENE =
  "https://images.pexels.com/photos/16813081/pexels-photo-16813081.jpeg?auto=compress&cs=tinysrgb&w=900";

type Mode = "Scene" | "OCR" | "Objects" | "Text";
const PROMPTS: Record<Mode, string> = {
  Scene: "Name the scene in 1-3 words on the first line, then up to 3 short lines describing it.",
  OCR: "Read all readable text exactly. First line: 'Text found'. Then the text.",
  Objects: "First line: 'Objects'. Then list the main objects, one short line each, nearest first.",
  Text: "First line: a title for the main sign or label. Then explain what it says and means in 2 lines.",
};

/** Virtual glasses view: what the glasses camera would see, with the glasses' capture modes. */
export default function SimulatorScreen() {
  const { prefs } = usePrefs();
  const capture = useCapture();
  const { status, connect } = useGlasses();
  const camera = useRef<CameraHandle>(null);
  const [mode, setMode] = useState<Mode>("Scene");
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = useRef(0);

  const stopCam = useCallback(() => setLive(false), []);
  const onError = useCallback(
    (m: string) => {
      setResult(m);
      setLive(false);
      capture.end(token.current);
    },
    [capture],
  );

  const analyse = async (image: string) => {
    setPhoto(image);
    setBusy(true);
    setResult(null);
    try {
      const a = await askVision(PROMPTS[mode], image, prefs.language, prefs.detailedDescriptions);
      setResult(a.text);
      if (prefs.autoSpeak) {
        speak(a.text, prefs.language, prefs.voiceRate);
      }
    } catch (e) {
      setResult(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const shutter = () => {
    if (status !== "connected") {
      void connect();
    }
    if (!live) {
      setPhoto(null);
      setResult(null);
      setLive(true);
      token.current = capture.begin("camera", "Virtual glasses camera", stopCam);
      return;
    }
    void (async () => {
      const shot = (await camera.current?.capture()) ?? null;
      setLive(false);
      capture.end(token.current);
      if (shot !== null) {
        void analyse(shot);
      }
    })();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#05070B" }}>
      <View style={{ flex: 1 }}>
        {live ? (
          <CameraPreview ref={camera} onError={onError} />
        ) : (
          <Image
            source={{ uri: photo ?? SAMPLE_SCENE }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
            accessibilityLabel="Glasses view"
          />
        )}
        <View
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            right: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close simulator"
            testID="simulator-close"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" color="#fff" size={18} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: "center",
              color: "#fff",
              fontFamily: FONTS.body,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            Virtual Glasses
          </Text>
          <View
            testID="simulator-live"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: status === "connected" ? "#22C55E" : "rgba(0,0,0,0.45)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
            }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" }} />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
              {status === "connected" ? "Live" : "Offline"}
            </Text>
          </View>
        </View>
        {result === null && !busy ? null : (
          <View
            testID="simulator-result"
            style={{
              position: "absolute",
              left: 40,
              right: 40,
              bottom: 24,
              backgroundColor: "rgba(10,12,18,0.72)",
              borderColor: "rgba(255,255,255,0.35)",
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ color: "#fff", fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}>
              {busy ? "Looking…" : result}
            </Text>
          </View>
        )}
      </View>
      <View style={{ paddingVertical: 14, gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
          {(Object.keys(PROMPTS) as Mode[]).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === m }}
              testID={`sim-mode-${m.toLowerCase()}`}
              onPress={() => setMode(m)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: mode === m ? "#1E6BFF" : "transparent",
              }}
            >
              <Text
                style={{ color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo"
            testID="sim-gallery"
            disabled={Platform.OS !== "web" || busy}
            onPress={() => pickImageFile((d) => d !== null && void analyse(d))}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.4)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="image" color="#fff" size={20} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={live ? "Take photo" : "Open glasses camera"}
            testID="sim-shutter"
            disabled={busy}
            onPress={shutter}
            style={{
              width: 74,
              height: 74,
              borderRadius: 37,
              borderWidth: 4,
              borderColor: "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: live ? "#EF4444" : "#fff",
              }}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Analyse sample scene"
            testID="sim-sample"
            disabled={busy}
            onPress={() =>
              void fetch(SAMPLE_SCENE)
                .then((r) => r.blob())
                .then(
                  (b) =>
                    new Promise<string>((res) => {
                      const fr = new FileReader();
                      fr.onload = () => res(String(fr.result));
                      fr.readAsDataURL(b);
                    }),
                )
                .then((d) => analyse(d))
                .catch(() => setResult("Sample scene unavailable."))
            }
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.4)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="flip" color="#fff" size={20} />
          </Pressable>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.6)", textAlign: "center", fontSize: 11 }}>
          Shutter opens the camera, tap again to capture. Right button analyses the sample scene.
        </Text>
      </View>
    </View>
  );
}
