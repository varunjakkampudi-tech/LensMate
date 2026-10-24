import { router } from "expo-router";
import { LegacySurface } from "../src/ui/legacy-surface";
import { DemoScreen } from "../src/demo/demo-screen";

/** The SEE-HEAR-TALK demo route (/demo). Synthetic samples and mock answers only. */
export default function DemoRoute() {
  return (
    <LegacySurface style={{ flex: 1, backgroundColor: "#F4F7FC" }}>
      <DemoScreen
        onBack={() => {
          // Go back when the demo was opened from inside the app, so history does not grow; after a direct load, replace.
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/");
          }
        }}
      />
    </LegacySurface>
  );
}
