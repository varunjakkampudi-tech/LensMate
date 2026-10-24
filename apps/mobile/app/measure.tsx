import { router } from "expo-router";
import { LegacySurface } from "../src/ui/legacy-surface";
import { MeasurementScreen } from "../src/measurement-screen";

export default function MeasureRoute() {
  return (
    <LegacySurface style={{ flex: 1, backgroundColor: "#F4F7FC" }}>
      <MeasurementScreen
        onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
    </LegacySurface>
  );
}
