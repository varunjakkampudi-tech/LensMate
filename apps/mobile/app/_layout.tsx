import { Stack } from "expo-router";
import { AppShell } from "../src/ui/app-shell";
import { CaptureProvider } from "../src/ui/capture-session";
import { GlassesProvider } from "../src/ui/glasses";
import { PwaStatus } from "../src/pwa/status-banner";
import { PrefsProvider } from "../src/ui/prefs";
import { ThemeProvider } from "../src/ui/theme";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PrefsProvider>
        <CaptureProvider>
          <GlassesProvider>
            <AppShell>
              <PwaStatus />
              <Stack screenOptions={{ headerShown: false }} />
            </AppShell>
          </GlassesProvider>
        </CaptureProvider>
      </PrefsProvider>
    </ThemeProvider>
  );
}
