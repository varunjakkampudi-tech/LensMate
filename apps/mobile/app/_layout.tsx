import { Stack } from "expo-router";
import { AppShell } from "../src/ui/app-shell";
import { CaptureProvider } from "../src/ui/capture-session";
import { GlassesProvider } from "../src/ui/glasses";
import { PrefsProvider } from "../src/ui/prefs";
import { ThemeProvider } from "../src/ui/theme";

const TITLES: Record<string, string> = {
  index: "LensMate",
  simulator: "Virtual Glasses",
  capture: "See – Photo & Ask",
  assistant: "Hear & Talk",
  translate: "Translate",
  memory: "Notes & memory",
  profile: "Profile",
  tasks: "Agents & automations",
  interview: "Interview practice",
  enrol: "Enrol this phone",
  measure: "Measurement",
  demo: "Demo",
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PrefsProvider>
        <CaptureProvider>
          <GlassesProvider>
            <AppShell>
              <Stack
                screenOptions={({ route }) => ({
                  headerShown: false,
                  title: TITLES[route.name] ?? "LensMate",
                })}
              />
            </AppShell>
          </GlassesProvider>
        </CaptureProvider>
      </PrefsProvider>
    </ThemeProvider>
  );
}
