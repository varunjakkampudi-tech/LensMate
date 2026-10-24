import { router } from "expo-router";
import { View } from "react-native";
import { MeasurementScreen } from "../src/measurement-screen";

export default function MeasureRoute() {
  return (
    <View style={{ flex: 1, backgroundColor: "#F6F4EF" }}>
      <MeasurementScreen
        onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
    </View>
  );
}
