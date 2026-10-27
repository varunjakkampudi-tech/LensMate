import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { rupees, useAiSetup } from "../src/ai/use-ai-setup";
import { listItems } from "../src/memory/vault";
import { brokerStatusText, readBrokerConfig } from "../src/broker-config";
import { builtAtIso, formatBuildLine } from "../src/build-info";
import { STRINGS } from "../src/strings";
import { Icon, type IconName } from "../src/ui/icon";
import { Body, Btn, Card, H2, Notice, Row } from "../src/ui/kit";
import { FONTS, useTheme } from "../src/ui/theme";

const ACTIONS: { title: string; icon: IconName; route: "/capture" | "/assistant" | "/memory" }[] = [
  { title: "Capture and ask", icon: "camera", route: "/capture" },
  { title: "Ask LensMate", icon: "mic", route: "/assistant" },
  { title: "Personal memory", icon: "note", route: "/memory" },
];

function ActionCard({ action }: { action: (typeof ACTIONS)[number] }) {
  return (
    <Btn
      label={action.title}
      icon={action.icon}
      tone="ghost"
      onPress={() => router.push(action.route)}
    />
  );
}

function SetupCard({ setup }: { setup: ReturnType<typeof useAiSetup> }) {
  if (setup.loading || setup.ready) return null;
  return (
    <Card testID="ai-setup-card">
      <H2>Connect the assistant</H2>
      {!setup.configured ? (
        <Notice tone="info">{brokerStatusText(readBrokerConfig())}</Notice>
      ) : null}
      {!setup.enrolled ? (
        <Btn
          label="Connect this phone"
          tone="ghost"
          icon="shield"
          onPress={() => router.push("/enrol")}
        />
      ) : null}
      {setup.accepted ? (
        <Notice tone="info">Privacy notice accepted.</Notice>
      ) : (
        <View testID="cloud-disclosure" style={{ gap: 8 }}>
          {STRINGS.cloudDisclosure.map((line) => (
            <Body key={line} size={13}>
              {line}
            </Body>
          ))}
          <Btn label="Review and accept" icon="check" onPress={() => void setup.accept()} />
        </View>
      )}
    </Card>
  );
}

export default function HomeScreen() {
  const { c } = useTheme();
  const setup = useAiSetup();
  const [memoryCount, setMemoryCount] = useState(0);
  useEffect(() => {
    void listItems()
      .then((items) => setMemoryCount(items.length))
      .catch(() => setMemoryCount(0));
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 36 }}
    >
      <View style={{ gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{ color: c.text, fontFamily: FONTS.display, fontSize: 30, fontWeight: "800" }}
        >
          LensMate
        </Text>
        <Body muted>AI glasses and your private phone companion.</Body>
      </View>

      <Card>
        <Row>
          <Icon name="glasses" color={c.accent} size={22} />
          <H2>Glasses connection</H2>
        </Row>
        <Body muted>
          Real glasses are not connected yet. The virtual device is available for development.
        </Body>
        <Btn
          label="Open device simulator"
          tone="ghost"
          icon="arrow"
          onPress={() => router.push("/simulator")}
        />
      </Card>

      <Card>
        <H2>Your LensMate</H2>
        <View style={{ gap: 8 }}>
          {ACTIONS.map((action) => (
            <ActionCard key={action.route} action={action} />
          ))}
        </View>
      </Card>

      <Card>
        <H2>On this phone</H2>
        <View testID="memory-count">
          <Body>
            {memoryCount} saved {memoryCount === 1 ? "item" : "items"} · encrypted local memory
          </Body>
        </View>
        <Body>AI setup: {setup.ready ? "ready" : "needs attention"}</Body>
        {setup.spentPaise === null || setup.capPaise === null ? null : (
          <Body>
            AI spend this month: {rupees(setup.spentPaise)} of {rupees(setup.capPaise)}
          </Body>
        )}
      </Card>

      <SetupCard setup={setup} />
      <Text
        testID="build-time"
        style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: "center" }}
      >
        {formatBuildLine(builtAtIso())}
      </Text>
    </ScrollView>
  );
}
