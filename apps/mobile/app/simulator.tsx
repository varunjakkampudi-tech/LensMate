import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { aiErrorText, askVision } from "../src/ai/assistant";
import { RunGuard } from "../src/ai/run-guard";
import { speak, stopSpeaking } from "../src/ai/speech";
import { CameraPreview, pickImageFile, type CameraHandle } from "../src/capture/camera";
import {
  canRetake,
  MODES,
  overlayState,
  PROMPTS,
  shutterAction,
  sourceLabel,
  type ImageSource,
  type Mode,
} from "../src/simulator/model";
import { useCapture } from "../src/ui/capture-session";
import { useGlasses } from "../src/ui/glasses";
import { Icon } from "../src/ui/icon";
import { usePrefs } from "../src/ui/prefs";
import { FONTS } from "../src/ui/theme";

function SampleSceneFallback() {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Illustrated sample street sign. This is not a live camera view."
      testID="simulator-sample-fallback"
      style={{ flex: 1, backgroundColor: "#BFD8EB", overflow: "hidden" }}
    >
      <View
        style={{
          position: "absolute",
          top: "13%",
          right: "12%",
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: "#F7D47A",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "-12%",
          right: "-12%",
          bottom: "-14%",
          height: "48%",
          borderRadius: 240,
          backgroundColor: "#718A78",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "48%",
          top: "34%",
          bottom: "15%",
          width: 12,
          borderRadius: 6,
          backgroundColor: "#66717C",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "20%",
          top: "27%",
          width: "60%",
          minHeight: 90,
          borderRadius: 14,
          backgroundColor: "#1E6BFF",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 4,
          borderColor: "#FFFFFF",
        }}
      >
        <Text style={{ color: "#FFFFFF", fontFamily: FONTS.body, fontWeight: "800", fontSize: 22 }}>
          ONE WAY
        </Text>
        <Text style={{ color: "#FFFFFF", fontFamily: FONTS.body, fontSize: 12, marginTop: 3 }}>
          Synthetic preview
        </Text>
      </View>
      <View
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 18,
          borderRadius: 14,
          backgroundColor: "rgba(5,7,11,0.78)",
          padding: 12,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontFamily: FONTS.body, fontSize: 14, fontWeight: "700" }}>
          Sample view
        </Text>
        <Text style={{ color: "#E4EAF3", fontFamily: FONTS.body, fontSize: 12, marginTop: 4 }}>
          Choose a photo or open the camera to try visual questions.
        </Text>
      </View>
    </View>
  );
}

/** Virtual glasses view: what the glasses camera would see, with the glasses' capture modes. */
export default function SimulatorScreen() {
  const { prefs } = usePrefs();
  const capture = useCapture();
  const { status, connect } = useGlasses();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraHandle>(null);
  const guard = useRef(new RunGuard()).current;
  const token = useRef(0);
  const [mode, setMode] = useState<Mode>("Scene");
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [source, setSource] = useState<ImageSource>("sample");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stopCam = useCallback(() => {
    setLive(false);
    capture.end(token.current);
  }, [capture]);

  const onError = useCallback(
    (m: string) => {
      setResult(m);
      setLive(false);
      capture.end(token.current);
    },
    [capture],
  );

  // Leaving the screen (navigation or unmount) cancels any analysis and releases the camera and the capture indicator.
  useEffect(
    () => () => {
      guard.cancel();
      stopSpeaking();
      capture.end(token.current);
    },
    [capture, guard],
  );

  const analyse = async (image: string, from: ImageSource) => {
    const run = guard.begin();
    setPhoto(image);
    setSource(from);
    setBusy(true);
    setResult(null);
    try {
      const a = await askVision(PROMPTS[mode], image, prefs.language, prefs.detailedDescriptions);
      if (!guard.isCurrent(run.id)) {
        return;
      }
      guard.finish(run.id);
      setResult(a.text);
      if (prefs.autoSpeak) {
        speak(a.text, prefs.language, prefs.voiceRate);
      }
    } catch (e) {
      if (!guard.isCurrent(run.id)) {
        return;
      }
      guard.finish(run.id);
      setResult(aiErrorText(e));
    } finally {
      if (guard.isCurrent(run.id)) {
        setBusy(false);
      }
    }
  };

  const openCamera = () => {
    if (status !== "connected") {
      void connect();
    }
    guard.cancel();
    setPhoto(null);
    setResult(null);
    setSource("live");
    setLive(true);
    token.current = capture.begin("camera", "Virtual glasses camera", stopCam);
  };

  const capturePhoto = () => {
    void (async () => {
      const shot = (await camera.current?.capture()) ?? null;
      setLive(false);
      capture.end(token.current);
      if (shot !== null) {
        void analyse(shot, "live");
      } else {
        setResult("The camera was not ready. Try again.");
      }
    })();
  };

  const shutter = () => {
    const action = shutterAction(live, busy);
    if (action === "open-camera") {
      openCamera();
    } else if (action === "capture") {
      capturePhoto();
    }
  };

  const stopAll = () => {
    guard.cancel();
    stopSpeaking();
    if (live) {
      setLive(false);
      capture.end(token.current);
    }
    setBusy(false);
  };

  const retake = () => {
    setPhoto(null);
    setResult(null);
    openCamera();
  };

  const overlay = overlayState(busy, result);
  const sourceText = live ? sourceLabel("live") : sourceLabel(source);
  const sourceIsCamera = live || source === "live";

  return (
    <View style={{ flex: 1, backgroundColor: "#05070B" }}>
      <View style={{ flex: 1 }}>
        {live ? (
          <CameraPreview ref={camera} onError={onError} />
        ) : photo === null ? (
          <SampleSceneFallback />
        ) : (
          <Image
            source={{ uri: photo }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
            accessibilityLabel="Captured glasses view"
          />
        )}

        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 12,
            right: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            testID="simulator-close"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={{
              minWidth: 48,
              minHeight: 48,
              borderRadius: 22,
              backgroundColor: "rgba(0,0,0,0.5)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="back" color="#fff" size={20} />
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
            numberOfLines={1}
          >
            Virtual Glasses
          </Text>
          <View
            testID="simulator-source"
            accessibilityLabel={`Image source: ${sourceText}`}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: sourceIsCamera ? "#EF4444" : "rgba(0,0,0,0.5)",
              borderWidth: sourceIsCamera ? 0 : 1,
              borderColor: "rgba(255,255,255,0.5)",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{sourceText}</Text>
          </View>
          <View
            testID="simulator-live"
            accessibilityLabel={`Glasses ${status === "connected" ? "connected" : "offline"}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: status === "connected" ? "#22C55E" : "rgba(0,0,0,0.5)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
            }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" }} />
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              {status === "connected" ? "Connected" : "Offline"}
            </Text>
          </View>
        </View>

        {overlay.kind === "hidden" ? null : (
          <View
            testID="simulator-result"
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: 12,
              maxHeight: "38%",
              backgroundColor: "rgba(10,12,18,0.8)",
              borderColor: "rgba(255,255,255,0.3)",
              borderWidth: 1,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <ScrollView>
              <Text style={{ color: "#fff", fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}>
                {overlay.kind === "working" ? "Looking…" : overlay.text}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 6 }}>
                {prefs.features.vision
                  ? "Answer from the phone's AI service"
                  : "Vision help is off"}
              </Text>
            </ScrollView>
          </View>
        )}
      </View>

      <View
        style={{
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          gap: 12,
          backgroundColor: "#05070B",
        }}
      >
        <View
          style={{ flexDirection: "row", justifyContent: "center", gap: 8, paddingHorizontal: 12 }}
        >
          {MODES.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityLabel={`${m} mode`}
              accessibilityState={{ selected: mode === m }}
              testID={`sim-mode-${m.toLowerCase()}`}
              onPress={() => setMode(m)}
              style={{
                minHeight: 48,
                minWidth: 64,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: mode === m ? "#1E6BFF" : "rgba(255,255,255,0.08)",
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
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            paddingHorizontal: 24,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo"
            testID="sim-gallery"
            disabled={Platform.OS !== "web" || busy}
            onPress={() => pickImageFile((d) => d !== null && void analyse(d, "photo"))}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.4)",
              alignItems: "center",
              justifyContent: "center",
              opacity: Platform.OS !== "web" || busy ? 0.4 : 1,
            }}
          >
            <Icon name="image" color="#fff" size={20} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={live ? "Capture photo" : "Open glasses camera"}
            testID="sim-shutter"
            disabled={busy}
            onPress={shutter}
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              borderWidth: 4,
              borderColor: "#fff",
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: live ? "#EF4444" : "#fff",
              }}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open guided demo"
            testID="sim-sample"
            disabled={busy}
            onPress={() => router.push("/demo")}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.4)",
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.4 : 1,
            }}
          >
            <Icon name="spark" color="#fff" size={20} />
          </Pressable>
        </View>

        <View
          style={{ flexDirection: "row", justifyContent: "center", gap: 12, paddingHorizontal: 16 }}
        >
          {canRetake(live, photo, busy) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retake photo"
              testID="sim-retake"
              onPress={retake}
              style={{
                minHeight: 48,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.5)",
              }}
            >
              <Icon name="camera" color="#fff" size={16} />
              <Text
                style={{ color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}
              >
                Retake
              </Text>
            </Pressable>
          ) : null}
          {live || busy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop"
              testID="sim-stop"
              onPress={stopAll}
              style={{
                minHeight: 48,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                backgroundColor: "#EF4444",
              }}
            >
              <Icon name="stop" color="#fff" size={16} />
              <Text
                style={{ color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: "700" }}
              >
                Stop
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
