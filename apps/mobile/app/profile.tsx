import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { PROTOCOL_VERSION } from "@lensmate/protocol";
import { latencyLog } from "../src/ai/assistant";
import { canListen, canSpeak, hasVoiceFor } from "../src/ai/speech";
import { rupees, useAiSetup } from "../src/ai/use-ai-setup";
import { readBrokerConfig } from "../src/broker-config";
import { STRINGS } from "../src/strings";
import { Body, Btn, Card, Chip, H2, Notice, Page, Row } from "../src/ui/kit";
import { AiConnectionCard } from "../src/ai/connection-card";
import { NotificationTestCard } from "../src/notify/test-card";
import { LangPicker } from "../src/ui/lang-picker";
import { FEATURES, usePrefs, type FeatureKey, type Profile } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

const PROFILES: { id: Profile; label: string; line: string }[] = [
  { id: "personal", label: "Personal", line: "Everything on, answers shown as text." },
  {
    id: "blind",
    label: "Blind assist",
    line: "Answers spoken automatically, detailed scene descriptions.",
  },
  {
    id: "hearing",
    label: "Hearing assist",
    line: "Large captions, nothing spoken unless you ask.",
  },
  { id: "custom", label: "Custom", line: "Your own mix of the switches below." },
];

const LATER: { name: string; reason: string }[] = [
  {
    name: "Computer (PC) control",
    reason:
      "Not in the v9 specification; needs an owner decision and a security review before any design.",
  },
  {
    name: "AI companion and proactive help",
    reason:
      "Needs continuous scene analysis; owner decision G26 and phase P3. An always-on camera is Locked.",
  },
  {
    name: "Walk alerts, obstacle and vehicle detection",
    reason: "Safety class: stays a disabled stub until tested at a competent facility (S1–S8).",
  },
  {
    name: "Sound alerts and emergency calling",
    reason: "Profile release, Safety class. Not enabled in P-1.",
  },
  { name: "Personal skills and developer mode", reason: "Phase P3 (v9 section 24)." },
  { name: "Firmware updates", reason: "Real glasses only; never run by the agent on hardware." },
];

function Toggle({
  label,
  value,
  onChange,
  testID,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 6,
      }}
    >
      <Text
        style={{
          color: disabled === true ? c.muted : c.text,
          fontFamily: FONTS.body,
          fontSize: 15,
          flex: 1,
        }}
      >
        {label}
      </Text>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: c.accent, false: c.surface2 }}
      />
    </View>
  );
}

function useBrokerHealth(): string {
  const [health, setHealth] = useState("checking");
  useEffect(() => {
    const config = readBrokerConfig();
    if (!config.ok) {
      setHealth("not configured");
      return;
    }
    fetch(`${config.baseUrl}/healthz`)
      .then((r) => setHealth(r.ok ? "online" : "unavailable"))
      .catch(() => setHealth("unreachable"));
  }, []);
  return health;
}

export default function MoreScreen() {
  const { c } = useTheme();
  const { prefs, update, applyProfile } = usePrefs();
  const setup = useAiSetup();
  const health = useBrokerHealth();
  const log = latencyLog();
  const ok = log.filter((l) => l.ok);
  const avg =
    ok.length === 0 ? null : Math.round(ok.reduce((s, l) => s + l.latencyMs, 0) / ok.length);
  const sorted = [...ok].sort((a, b) => a.latencyMs - b.latencyMs);
  const p90 =
    sorted.length === 0
      ? null
      : (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]?.latencyMs ?? null);

  return (
    <Page title="Profile & settings" kicker="PROFILES · DEVICE · PRIVACY">
      <Card>
        <H2>Profile</H2>
        <Row>
          {PROFILES.map((p) => (
            <Chip
              key={p.id}
              testID={`profile-${p.id}`}
              label={p.label}
              active={prefs.profile === p.id}
              onPress={() => applyProfile(p.id)}
            />
          ))}
        </Row>
        <Body muted size={14}>
          {PROFILES.find((p) => p.id === prefs.profile)?.line}
        </Body>
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H2>Features</H2>
          {(Object.keys(FEATURES) as FeatureKey[]).map((k) => (
            <Toggle
              key={k}
              testID={`feature-${k}`}
              label={FEATURES[k]}
              value={prefs.features[k]}
              onChange={(v) => update({ features: { ...prefs.features, [k]: v } })}
            />
          ))}
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H2>Voice and accessibility</H2>
          <Toggle
            testID="pref-autospeak"
            label="Speak answers automatically"
            value={prefs.autoSpeak}
            onChange={(v) => update({ autoSpeak: v })}
          />
          <Toggle
            testID="pref-captions"
            label="Large captions"
            value={prefs.largeCaptions}
            onChange={(v) => update({ largeCaptions: v })}
          />
          <Toggle
            testID="pref-detailed"
            label="Detailed scene descriptions"
            value={prefs.detailedDescriptions}
            onChange={(v) => update({ detailedDescriptions: v })}
          />
          <Body muted size={14}>
            Speaking speed: {prefs.voiceRate.toFixed(1)}×
          </Body>
          <Row>
            {[0.8, 1, 1.2, 1.5].map((r) => (
              <Chip
                key={r}
                testID={`voice-rate-${r}`}
                label={`${r}×`}
                active={prefs.voiceRate === r}
                onPress={() => update({ voiceRate: r })}
              />
            ))}
          </Row>
          <LangPicker
            prefix="pref-lang"
            value={prefs.language}
            onChange={(l) => update({ language: l, profile: prefs.profile })}
          />
        </Card>
      </View>

      <Card>
        <H2>Agents & automations</H2>
        <Body muted size={14}>
          Multi-agent tasks, live web research and daily automations.
        </Body>
        <Btn
          testID="open-tasks-button"
          label="Open agents & automations"
          tone="ghost"
          icon="agent"
          disabled={!prefs.features.tasks}
          onPress={() => router.push("/tasks")}
        />
      </Card>

      <AiConnectionCard />

      <NotificationTestCard />

      <Card>
        <H2>Diagnostics</H2>
        <Body muted size={14}>
          What this phone or browser can do right now: camera, spoken answers, voice input,
          notifications, broker address and encrypted notes.
        </Body>
        <Btn
          testID="open-diagnostics-button"
          label="Open diagnostics"
          tone="ghost"
          icon="chart"
          onPress={() => router.push("/diagnostics" as "/")}
        />
      </Card>

      <Card>
        <H2>Interview practice</H2>
        <Body muted size={14}>
          Mock questions, feedback and debriefs. Practice only: LensMate never helps during a live
          interview.
        </Body>
        <Btn
          testID="open-interview-button"
          label="Open interview practice"
          tone="ghost"
          icon="user"
          disabled={!prefs.features.interview}
          onPress={() => router.push("/interview")}
        />
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H2>Device and diagnostics</H2>
          <Body size={14}>Glasses: virtual glasses simulator (connect on Home)</Body>
          <Body size={14}>Battery and temperature: not reported by the simulator</Body>
          <Body size={14}>Link protocol: v{String(PROTOCOL_VERSION)}</Body>
          <Body size={14}>
            AI service: <Text testID="broker-health">{health}</Text>
          </Body>
          <Body size={14}>
            Speech in: {canListen() ? "available" : "not available"} · Speech out:{" "}
            {canSpeak() ? "available" : "not available"} · Telugu voice:{" "}
            {hasVoiceFor("te") ? "yes" : "no"}
          </Body>
          <Body size={14}>
            This phone: {setup.enrolled ? "enrolled" : "not enrolled"} · cloud notice{" "}
            {setup.accepted ? "accepted" : "not accepted"}
          </Body>
          <Btn
            label={STRINGS.openEnrolment}
            tone="ghost"
            icon="shield"
            onPress={() => router.push("/enrol")}
          />
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H2>Measurement</H2>
          <Body size={14}>
            AI calls this session: {log.length} ({ok.length} answered)
          </Body>
          <Text
            testID="latency-stats"
            style={{ color: c.text, fontFamily: FONTS.mono, fontSize: 14 }}
          >
            avg {avg === null ? "–" : `${avg} ms`} · p90 {p90 === null ? "–" : `${p90} ms`}
          </Text>
          <Body size={14}>
            Spend this month: {setup.spentPaise === null ? "–" : rupees(setup.spentPaise)} of{" "}
            {setup.capPaise === null ? "₹500.00" : rupees(setup.capPaise)}
          </Body>
          <Btn
            label={STRINGS.openMeasurement}
            tone="ghost"
            icon="chart"
            onPress={() => router.push("/measure")}
          />
        </Card>
      </View>

      <Card>
        <H2>Privacy</H2>
        {STRINGS.cloudDisclosure.map((line) => (
          <Body key={line} size={14}>
            {line}
          </Body>
        ))}
        <Notice tone="info">
          Never built, at any time: face or voice identification, identifying people, always-on
          camera, background recording, covert interview help.
        </Notice>
      </Card>

      <Card>
        <H2>Later phases</H2>
        {LATER.map((l) => (
          <View key={l.name} testID="later-feature" style={{ gap: 2 }}>
            <Body>
              {l.name} · <Text style={{ color: c.accent2 }}>not available yet</Text>
            </Body>
            <Body muted size={13}>
              {l.reason}
            </Body>
          </View>
        ))}
      </Card>
    </Page>
  );
}
