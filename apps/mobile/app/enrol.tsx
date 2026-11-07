import { router } from "expo-router";
import { LegacySurface } from "../src/ui/legacy-surface";
import { View } from "react-native";
import { readBrokerConfig } from "../src/broker-config";
import { EnrolmentScreen } from "../src/enrolment-screen";
import { useTheme } from "../src/ui/theme";

export default function EnrolRoute() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LegacySurface
        style={{
          flex: 1,
          backgroundColor: "#FFFFFF",
          margin: 20,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: c.border,
          overflow: "hidden",
        }}
      >
        <EnrolmentScreen
          config={readBrokerConfig()}
          onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      </LegacySurface>
    </View>
  );
}
