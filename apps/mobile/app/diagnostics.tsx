import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { canListen, canSpeak, speak, stopSpeaking } from "../src/ai/speech";
import { readBrokerConfig } from "../src/broker-config";
import { collectDiagnostics, type CheckResult, type CheckStatus } from "../src/diagnostics/checks";
import { MemoryStoreError } from "../src/memory/memory-error";
import { nativeMemory } from "../src/memory/native-store";
import { NATIVE_LISTENING_ENABLED } from "../src/ai/native-listen";
import {
  notificationPermission,
  requestNotificationPermission,
  type NotifyPermission,
} from "../src/notify/local";
import { Body, Btn, Card, H2, Notice, Page } from "../src/ui/kit";
import { usePrefs } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

const TONE: Record<CheckStatus, { label: string; color: "ok" | "warn" | "muted" | "error" }> = {
  configured: { label: "Configured (not tested here)", color: "ok" },
  ok: { label: "Working", color: "ok" },
  needs_device: { label: "Needs a phone check", color: "warn" },
  off: { label: "Off in this build", color: "muted" },
  unavailable: { label: "Unavailable", color: "error" },
};

/** Reads the real device state for each check. Nothing here starts the camera, listens, or calls the broker. */
async function readInputs(): Promise<Parameters<typeof collectDiagnostics>[0]> {
  const web = Platform.OS === "web";
  let memory: Parameters<typeof collectDiagnostics>[0]["memory"] = "web";
  if (!web) {
    try {
      await nativeMemory().list();
      memory = "encrypted";
    } catch (error) {
      memory = error instanceof MemoryStoreError ? error.failure : "FAILED";
    }
  }
  let notifications: NotifyPermission = "unsupported";
  if (!web) {
    notifications = await notificationPermission();
  }
  return {
    broker: readBrokerConfig(),
    cameraAvailable: web
      ? typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function"
      : true,
    speechOutputAvailable: canSpeak(),
    speechInputEnabled: web ? canListen() : NATIVE_LISTENING_ENABLED,
    notifications,
    memory,
    platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
  };
}

export default function DiagnosticsScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => {
    void readInputs()
      .then((inputs) => setResults(collectDiagnostics(inputs)))
      .catch(() => setNote("Could not read this device's state. Try again."));
  };
  useEffect(refresh, []);

  const colorFor = (s: CheckStatus) =>
    TONE[s].color === "ok"
      ? c.accent
      : TONE[s].color === "warn"
        ? c.accent2
        : TONE[s].color === "error"
          ? c.danger
          : c.muted;

  return (
    <Page title="Diagnostics" kicker="WHAT THIS BUILD CAN DO">
      <Body muted size={14}>
        Each line shows what this phone or browser can do right now. Checks do not start the camera
        or microphone, do not call the AI, and do not send a notification. Results on a phone need a
        phone check.
      </Body>
      {!prefs.features.vision ? (
        <Notice tone="warn">Vision help is switched off in Profile → Features.</Notice>
      ) : null}
      {note === null ? null : <Notice tone="error">{note}</Notice>}
      <Card>
        <H2>Checks</H2>
        {results === null ? (
          <Body muted>Checking…</Body>
        ) : (
          results.map((r) => (
            <View key={r.id} testID={`diag-${r.id}`} style={{ gap: 4, paddingVertical: 8 }}>
              <Text style={{ color: c.text, fontFamily: FONTS.display, fontWeight: "700" }}>
                {r.label}
              </Text>
              <Text
                style={{
                  color: colorFor(r.status),
                  fontFamily: FONTS.body,
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                {TONE[r.status].label}
              </Text>
              <Body muted size={13}>
                {r.detail}
              </Body>
            </View>
          ))
        )}
        <Btn testID="diag-refresh" label="Check again" tone="ghost" onPress={refresh} />
      </Card>
      <Card>
        <H2>Tests you can run now</H2>
        <Btn
          testID="diag-speak"
          label="Speak a test sentence"
          icon="speaker"
          onPress={() => speak("This is a LensMate speech test.", prefs.language, prefs.voiceRate)}
        />
        <Btn
          testID="diag-stop-speech"
          label="Stop speech"
          tone="ghost"
          onPress={() => stopSpeaking()}
        />
        <Btn
          testID="diag-ask-notifications"
          label="Ask for notification permission"
          tone="ghost"
          icon="bell"
          disabled={Platform.OS === "web"}
          onPress={() => void requestNotificationPermission().then(() => refresh())}
        />
        <Btn
          testID="diag-open-see"
          label="Open See (camera)"
          tone="ghost"
          icon="camera"
          onPress={() => router.push("/capture")}
        />
        <Btn
          testID="diag-open-profile"
          label="Open Profile (notification test)"
          tone="ghost"
          onPress={() => router.push("/profile")}
        />
      </Card>
    </Page>
  );
}
