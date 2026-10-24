import { router } from "expo-router";
import { DemoScreen } from "../src/demo/demo-screen";

/** The SEE-HEAR-TALK demo route (/demo). Synthetic samples and mock answers only. */
export default function DemoRoute() {
  return (
    <DemoScreen
      onBack={() => {
        router.navigate("/");
      }}
    />
  );
}
