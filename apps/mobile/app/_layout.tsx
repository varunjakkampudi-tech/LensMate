import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { initialNotificationRoute, onNotificationTap } from "../src/notify/local";
import { AppShell } from "../src/ui/app-shell";
import { CaptureProvider } from "../src/ui/capture-session";
import { GlassesProvider } from "../src/ui/glasses";
import { PwaStatus } from "../src/pwa/status-banner";
import { PrefsProvider } from "../src/ui/prefs";
import { ThemeProvider } from "../src/ui/theme";

export default function RootLayout() {
  // A tapped notification opens its in-app route (validated in local.ts).
  useEffect(() => {
    // Opened from a notification while the app was closed: go to its route once, then follow live taps.
    void initialNotificationRoute()
      .then((route) => {
        if (route !== undefined) {
          router.navigate(route as "/");
        }
      })
      .catch(() => undefined);
    return onNotificationTap((route) => router.navigate(route as "/"));
  }, []);
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
