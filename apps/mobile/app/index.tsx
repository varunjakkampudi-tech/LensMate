import { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { readBrokerConfig } from "../src/broker-config";
import { DEMO } from "../src/demo/demo-strings";
import { EnrolmentScreen } from "../src/enrolment-screen";
import { MeasurementScreen } from "../src/measurement-screen";
import { STRINGS } from "../src/strings";
import { useVirtualGlasses } from "../src/use-virtual-glasses";

export default function HomeScreen() {
  const { status, error, connect, disconnect } = useVirtualGlasses();
  const [measuring, setMeasuring] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const connected = status === "connected";

  if (enrolling) {
    return <EnrolmentScreen config={readBrokerConfig()} onClose={() => setEnrolling(false)} />;
  }

  if (measuring) {
    return <MeasurementScreen onClose={() => setMeasuring(false)} />;
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 16, justifyContent: "center" }}>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: "600" }}>
        {STRINGS.title}
      </Text>
      <Text
        accessibilityLabel={`${STRINGS.statusLabel}: ${connected ? STRINGS.statusConnected : STRINGS.statusDisconnected}`}
      >
        {connected ? STRINGS.statusConnected : STRINGS.statusDisconnected}
      </Text>
      {error === null ? null : <Text accessibilityRole="alert">{error}</Text>}
      <Pressable
        accessibilityRole="button"
        style={{ minHeight: 48, padding: 12, borderRadius: 8, backgroundColor: "#1f4e79" }}
        onPress={() => {
          void (connected ? disconnect() : connect());
        }}
      >
        <Text style={{ color: "#ffffff", textAlign: "center" }}>
          {connected ? STRINGS.disconnect : STRINGS.connect}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={{
          minHeight: 48,
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#1f4e79",
        }}
        onPress={() => {
          setMeasuring(true);
        }}
      >
        <Text style={{ color: "#1f4e79", textAlign: "center" }}>{STRINGS.openMeasurement}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={{
          minHeight: 48,
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#1f4e79",
        }}
        onPress={() => {
          setEnrolling(true);
        }}
      >
        <Text style={{ color: "#1f4e79", textAlign: "center" }}>{STRINGS.openEnrolment}</Text>
      </Pressable>
      <Text style={{ fontSize: 14 }}>{DEMO.openHint}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={DEMO.openButton}
        style={{
          minHeight: 48,
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#1f4e79",
        }}
        onPress={() => {
          router.push("/demo");
        }}
      >
        <Text style={{ color: "#1f4e79", textAlign: "center" }}>{DEMO.openButton}</Text>
      </Pressable>
    </View>
  );
}
