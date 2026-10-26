import { router } from "expo-router";
import { createElement, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { rupees, useAiSetup, type AiSetup } from "../src/ai/use-ai-setup";
import { DEMO } from "../src/demo/demo-strings";
import { listItems, type MemoryItem } from "../src/memory/vault";
import {
  clockOf,
  dayOf,
  hydrateAutomations,
  loadAutomations,
  type Automation,
} from "../src/ai/automations";
import { canListen } from "../src/ai/speech";
import { hudRows, type HudRow } from "../src/ui/hud-model";
import { buildBriefing } from "../src/ai/briefing";
import { speak } from "../src/ai/speech";
import { STRINGS } from "../src/strings";
import { useGlasses } from "../src/ui/glasses";
import { Icon, type IconName } from "../src/ui/icon";
import { Body, Btn, Card, H2, Notice, Row } from "../src/ui/kit";
import { usePrefs, type FeatureKey } from "../src/ui/prefs";
import { brokerStatusText, readBrokerConfig } from "../src/broker-config";
import { ReadinessSection } from "../src/readiness/readiness-section";
import { builtAtIso, formatBuildLine } from "../src/build-info";
import { FONTS, useTheme } from "../src/ui/theme";

type Tint = "tintBlue" | "tintRed" | "tintIndigo" | "tintAmber";
const TILES: {
  href: "/capture" | "/assistant" | "/translate" | "/memory";
  title: string;
  line: string;
  icon: IconName;
  tint: Tint;
  color: string;
}[] = [
  {
    href: "/capture",
    title: "See",
    line: "Capture & understand",
    icon: "camera",
    tint: "tintBlue",
    color: "#1E6BFF",
  },
  {
    href: "/assistant",
    title: "Hear & Talk",
    line: "Ask anything",
    icon: "mic",
    tint: "tintRed",
    color: "#EF4444",
  },
  {
    href: "/translate",
    title: "Translate",
    line: "Live translation",
    icon: "globe",
    tint: "tintIndigo",
    color: "#4F46E5",
  },
  {
    href: "/memory",
    title: "Notes",
    line: "Save what matters",
    icon: "note",
    tint: "tintAmber",
    color: "#F59E0B",
  },
];

const TOOLS: {
  href: "/tasks" | "/interview" | "/measure" | "/demo" | "/enrol";
  label: string;
  icon: IconName;
  /** Set for a feature outside the active phase: the tile is hidden while that feature is switched off. */
  feature?: FeatureKey;
}[] = [
  { href: "/tasks", label: "Agents & automations", icon: "agent", feature: "tasks" },
  { href: "/interview", label: "Interview practice", icon: "user", feature: "interview" },
  { href: "/measure", label: STRINGS.openMeasurement, icon: "chart" },
  { href: "/demo", label: DEMO.openButton, icon: "spark" },
  { href: "/enrol", label: STRINGS.openEnrolment, icon: "shield" },
];

function GlassesArt({ color }: { color: string }) {
  if (Platform.OS !== "web") {
    return <Icon name="glasses" size={64} color={color} />;
  }
  return createElement(
    "svg",
    { width: 200, height: 70, viewBox: "0 0 200 70", fill: "none", "aria-hidden": true },
    createElement("path", {
      d: "M8 14h76v22a26 26 0 0 1-26 26H34A26 26 0 0 1 8 36Z M116 14h76v22a26 26 0 0 1-26 26h-24a26 26 0 0 1-26-26Z",
      stroke: color,
      strokeWidth: 9,
      strokeLinejoin: "round",
      fill: "rgba(160,190,230,0.12)",
    }),
    createElement("path", {
      d: "M84 22c5-4 10-6 16-6s11 2 16 6 M4 16 0 12 M196 16l4-4",
      stroke: color,
      strokeWidth: 7,
      strokeLinecap: "round",
    }),
  );
}

function Tile({ tile }: { tile: (typeof TILES)[number] }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tile.title}
      testID={`tile-${tile.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      onPress={() => router.push(tile.href)}
      style={({ pressed }) => ({
        width: "48%",
        backgroundColor: c[tile.tint],
        borderRadius: 18,
        padding: 16,
        gap: 6,
        minHeight: 120,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: c.surface,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Icon name={tile.icon} color={tile.color} size={22} />
      </View>
      <Text
        style={{
          color: tile.title === "Hear & Talk" ? tile.color : c.text,
          fontFamily: FONTS.display,
          fontSize: 16,
          fontWeight: "700",
        }}
      >
        {tile.title}
      </Text>
      <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12 }}>{tile.line}</Text>
    </Pressable>
  );
}

function SimulatorCard() {
  const { c } = useTheme();
  const { status, error, connect, disconnect } = useGlasses();
  const connected = status === "connected";
  return (
    <Card style={{ alignItems: "center", backgroundColor: c.surface2, borderWidth: 0 }}>
      <GlassesArt color={c.text} />
      <Text style={{ color: c.text, fontFamily: FONTS.display, fontSize: 15, fontWeight: "700" }}>
        Virtual Glasses Simulator
      </Text>
      <Text
        testID="glasses-status"
        accessibilityLabel={`${STRINGS.statusLabel}: ${connected ? STRINGS.statusConnected : STRINGS.statusDisconnected}`}
        style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12 }}
      >
        {connected ? STRINGS.statusConnected : STRINGS.statusDisconnected}
      </Text>
      <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12 }}>
        Try the experience before your device arrives
      </Text>
      {error === null ? null : <Notice tone="error">{error}</Notice>}
      <View style={{ width: "100%", gap: 8 }}>
        <Btn
          testID="start-simulator-button"
          label="Start Simulator"
          icon="arrow"
          onPress={() => router.push("/simulator")}
        />
        <Btn
          testID="glasses-connect-button"
          label={connected ? STRINGS.disconnect : STRINGS.connect}
          tone="ghost"
          icon="glasses"
          onPress={() => void (connected ? disconnect() : connect())}
        />
      </View>
    </Card>
  );
}

function SetupCard({ setup }: { setup: AiSetup }) {
  if (setup.loading || setup.ready) {
    return null;
  }
  return (
    <Card testID="ai-setup-card">
      <H2>Set up AI on this phone</H2>
      {!setup.configured ? (
        <Notice tone="info" testID="ai-address-status">
          {brokerStatusText(readBrokerConfig())}
        </Notice>
      ) : null}
      <Body muted>1. Enrol with the owner's code {setup.enrolled ? "· done" : ""}</Body>
      {setup.enrolled ? null : (
        <Btn
          testID="setup-enrol-button"
          label={STRINGS.openEnrolment}
          tone="ghost"
          icon="shield"
          onPress={() => router.push("/enrol")}
        />
      )}
      <Body muted>2. Read and accept the cloud notice</Body>
      <View testID="cloud-disclosure" style={{ gap: 6 }}>
        {STRINGS.cloudDisclosure.map((line) => (
          <Body key={line} size={13}>
            {line}
          </Body>
        ))}
      </View>
      {setup.accepted ? (
        <Notice tone="info">Cloud notice accepted.</Notice>
      ) : (
        <Btn
          testID="accept-disclosure-button"
          label="I understand and accept"
          icon="check"
          onPress={() => void setup.accept()}
        />
      )}
    </Card>
  );
}

export default function HomeScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const setup = useAiSetup();
  const [due, setDue] = useState<MemoryItem[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [openReminders, setOpenReminders] = useState<readonly MemoryItem[]>([]);
  const [routines, setRoutines] = useState<readonly Automation[]>([]);
  useEffect(() => {
    void listItems()
      .then((items) => {
        const reminders = items.filter((i) => i.kind === "reminder");
        setDue(reminders.filter((i) => i.done !== true).slice(0, 3));
        setOpenReminders(reminders);
        setMemoryCount(items.length);
      })
      .catch(() => setDue([]));
    void hydrateAutomations()
      .then(() => setRoutines(loadAutomations()))
      .catch(() => setRoutines([]));
  }, []);
  const now = new Date();
  const briefing = buildBriefing({
    routines,
    reminders: openReminders,
    day: dayOf(now),
    clock: clockOf(now),
  });
  const board = hudRows({
    cameraLive: false,
    micAvailable: canListen(),
    memoryCount,
    automations: routines,
    aiReady: setup.configured && setup.enrolled && setup.accepted,
    day: dayOf(now),
    clock: clockOf(now),
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}
    >
      <View>
        <Text
          accessibilityRole="header"
          style={{ color: c.text, fontFamily: FONTS.display, fontSize: 30, fontWeight: "800" }}
        >
          Hello!
        </Text>
        <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 16, marginTop: 4 }}>
          Your AI glasses companion is ready.
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 12,
        }}
      >
        {TILES.map((t) => (
          <Tile key={t.href} tile={t} />
        ))}
      </View>
      <JarvisBoard rows={board} />
      <BriefingCard spoken={briefing.spoken} lines={briefing.lines} />
      <SimulatorCard />
      <ReadinessSection />
      <Text
        testID="build-time"
        style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: "center" }}
      >
        {formatBuildLine(builtAtIso())}
      </Text>
      <SetupCard setup={setup} />
      {setup.spentPaise === null || setup.capPaise === null ? null : (
        <Card>
          <Row wrap={false}>
            <Body muted size={13}>
              AI spend this month
            </Body>
            <View style={{ flex: 1 }} />
            <Text
              testID="spend-amount"
              style={{ color: c.text, fontFamily: FONTS.mono, fontSize: 15 }}
            >
              {rupees(setup.spentPaise)} / {rupees(setup.capPaise)}
            </Text>
          </Row>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surface2 }}>
            <View
              style={{
                width: `${Math.max(2, Math.min(100, (setup.spentPaise / setup.capPaise) * 100))}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: c.accent,
              }}
            />
          </View>
        </Card>
      )}
      {due.length === 0 ? null : (
        <Card>
          <H2>Upcoming reminders</H2>
          {due.map((r) => (
            <Body key={r.id} size={14}>
              {r.title} · {r.dueAt === undefined ? "" : new Date(r.dueAt).toLocaleTimeString()}
            </Body>
          ))}
        </Card>
      )}
      <Card>
        <H2>More tools</H2>
        <Body muted size={13}>
          {DEMO.openHint}
        </Body>
        {TOOLS.filter((t) => t.feature === undefined || prefs.features[t.feature]).map((t) => (
          <Pressable
            key={t.href}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            testID={`tool-${t.href.slice(1)}`}
            onPress={() => router.push(t.href)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 48,
              gap: 12,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: c.border,
            }}
          >
            <Icon name={t.icon} color={c.accent} size={20} />
            <Text
              style={{
                flex: 1,
                color: c.text,
                fontFamily: FONTS.body,
                fontSize: 15,
                fontWeight: "600",
              }}
            >
              {t.label}
            </Text>
            <Icon name="arrow" color={c.muted} size={16} />
          </Pressable>
        ))}
      </Card>
    </ScrollView>
  );
}

/** The JARVIS status board: what is on, what is ready, and what needs setup. Every row comes from hudRows. */
function JarvisBoard({ rows }: { rows: readonly HudRow[] }) {
  const { c } = useTheme();
  const toneColor = { on: c.danger, off: c.muted, ready: c.accent, warn: c.accent2 } as const;
  return (
    <Card testID="jarvis-board" style={{ gap: 10 }}>
      <Text style={{ color: c.text, fontFamily: FONTS.display, fontSize: 16, fontWeight: "700" }}>
        JARVIS status
      </Text>
      {rows.map((r) => (
        <View key={r.key} testID={`hud-${r.key}`} style={{ gap: 2 }}>
          <Text
            style={{
              color: toneColor[r.tone],
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: "700",
            }}
          >
            {r.label}
          </Text>
          <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}>
            {r.value}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** Today's briefing. Nothing is read aloud until the owner presses the button. */
function BriefingCard({ spoken, lines }: { spoken: string; lines: readonly string[] }) {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  return (
    <Card testID="briefing-card" style={{ gap: 10 }}>
      <Text style={{ color: c.text, fontFamily: FONTS.display, fontSize: 16, fontWeight: "700" }}>
        Today
      </Text>
      {lines.map((line) => (
        <Text
          key={line}
          style={{ color: c.text, fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}
        >
          {line}
        </Text>
      ))}
      <Btn
        testID="briefing-read-aloud"
        label="Read aloud"
        tone="ghost"
        icon="speaker"
        onPress={() => speak(spoken, prefs.language, prefs.voiceRate)}
      />
    </Card>
  );
}
