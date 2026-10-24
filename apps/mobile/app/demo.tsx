import { router } from "expo-router";
import { LegacySurface } from "../src/ui/legacy-surface";
import { DemoScreen } from "../src/demo/demo-screen";
import { goHome } from "../src/navigation";

/** The SEE-HEAR-TALK demo route (/demo). Synthetic samples and mock answers only. */
export default function DemoRoute() {
  return (
    <LegacySurface style={{ flex: 1, backgroundColor: "#F4F7FC" }}>
      <DemoScreen onBack={() => goHome(router)} />
    </LegacySurface>
  );
}
