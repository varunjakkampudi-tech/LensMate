import { router, usePathname } from "expo-router";
import { createElement, useEffect, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runDueAutomations } from "../ai/automations";
import { listItems, saveItem } from "../memory/vault";
import { useCapture } from "./capture-session";
import { useGlasses } from "./glasses";
import { Icon, type IconName } from "./icon";
import { FONTS, useTheme } from "./theme";

const TABS: {
  href: "/" | "/simulator" | "/capture" | "/assistant" | "/profile";
  label: string;
  icon: IconName;
}[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/simulator", label: "Simulator", icon: "glasses" },
  { href: "/capture", label: "Capture", icon: "camera" },
  { href: "/assistant", label: "Assistant", icon: "user" },
  { href: "/profile", label: "Profile", icon: "sliders" },
];

/** Brand mark: the blue glasses glyph from the mock-up. */
function BrandGlasses({ size, color }: { size: number; color: string }) {
  if (Platform.OS !== "web") {
    return <Icon name="glasses" size={size} color={color} />;
  }
  return createElement(
    "svg",
    {
      width: size * 1.6,
      height: size,
      viewBox: "0 0 40 24",
      fill: "none",
      stroke: color,
      strokeWidth: 3.2,
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    createElement("path", {
      d: "M2 6h14v8a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5Z M24 6h14v8a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5Z M16 8c1.2-1 2.6-1.5 4-1.5S22.8 7 24 8",
    }),
  );
}

function StatusPill() {
  const { c } = useTheme();
  const { status } = useGlasses();
  const on = status === "connected";
  return (
    <View
      testID="header-status"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: on ? c.okBg : c.surface2,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
      }}
    >
      <View
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c.ok : c.muted }}
      />
      <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 12, fontWeight: "500" }}>
        {on ? "Connected" : "Disconnected"}
      </Text>
    </View>
  );
}

function Header() {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 18,
        paddingVertical: 12,
        backgroundColor: c.bg,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="LensMate home"
        onPress={() => router.navigate("/")}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
      >
        <BrandGlasses size={18} color={c.accent} />
        <Text
          style={{
            color: c.text,
            fontFamily: FONTS.display,
            fontSize: 20,
            fontWeight: "800",
            letterSpacing: -0.4,
          }}
        >
          LensMate
        </Text>
      </Pressable>
      <StatusPill />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        testID="header-settings"
        onPress={() => router.navigate("/profile")}
        style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="gear" color={c.text} size={22} />
      </Pressable>
    </View>
  );
}

/** Session indicator (G6): visible on every screen while camera or microphone runs, with one-tap Stop. */
function IndicatorBar() {
  const { c } = useTheme();
  const { active, stopAll } = useCapture();
  if (active === null) {
    return null;
  }
  return (
    <View
      testID="capture-indicator"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: c.live,
        paddingHorizontal: 16,
        paddingVertical: 9,
      }}
    >
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" }} />
      <Text style={{ flex: 1, color: "#fff", fontFamily: FONTS.body, fontWeight: "700" }}>
        {active.kind === "camera" ? "Camera on" : "Microphone on"} · {active.label}
      </Text>
      <Pressable
        accessibilityRole="button"
        testID="capture-stop-button"
        onPress={stopAll}
        style={{
          minHeight: 48,
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.25)",
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 999,
        }}
      >
        <Icon name="stop" color="#fff" size={16} />
        <Text style={{ color: "#fff", fontWeight: "700" }}>Stop</Text>
      </Pressable>
    </View>
  );
}

/** Reminders and automations run while the app is open (checked every 30 s). */
function useTicker() {
  useEffect(() => {
    const notify = (title: string, body: string) => {
      if (
        Platform.OS === "web" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification(title, { body });
      } else if (Platform.OS === "web") {
        globalThis.alert(`${title}: ${body}`);
      }
    };
    const timer = setInterval(() => {
      void listItems()
        .then(async (items) => {
          for (const item of items) {
            if (
              item.kind === "reminder" &&
              item.done !== true &&
              item.dueAt !== undefined &&
              item.dueAt <= Date.now()
            ) {
              await saveItem({ ...item, done: true });
              notify("LensMate reminder", item.title);
            }
          }
        })
        .catch(() => undefined);
      // Encrypted notes can be unavailable (Expo Go, lost key). The reminder check then skips silently.
      void runDueAutomations(notify).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
}

/**
 * Height that clears a screen edge (notch, home indicator). Phones use the measured inset. On web, the browser reports
 * the inset as a CSS env() value, which react-native-web passes through unchanged; the cast reflects that.
 */
function safeHeight(edge: "top" | "bottom", measured: number): number {
  return Platform.OS === "web" ? (`env(safe-area-inset-${edge})` as unknown as number) : measured;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  useTicker();
  const immersive = path.startsWith("/simulator");
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center" }}>
      <View style={{ flex: 1, width: "100%", maxWidth: 560, backgroundColor: c.bg }}>
        <View
          testID="safe-top"
          style={{ height: safeHeight("top", insets.top), backgroundColor: c.bg }}
        />
        <IndicatorBar />
        {immersive ? null : <Header />}
        <View style={{ flex: 1 }}>{children}</View>
        <View
          testID="bottom-nav"
          style={{
            minHeight: 48,
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.surface,
            paddingTop: 8,
            paddingBottom: 10,
          }}
        >
          {TABS.map((tab) => {
            const on = isActive(tab.href);
            return (
              <Pressable
                key={tab.href}
                accessibilityRole="link"
                accessibilityLabel={tab.label}
                testID={`nav-${tab.label.toLowerCase()}`}
                onPress={() => router.navigate(tab.href)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                <Icon name={tab.icon} color={on ? c.accent : c.muted} size={22} />
                <Text
                  style={{
                    color: on ? c.accent : c.muted,
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    fontWeight: on ? "700" : "500",
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View
          testID="safe-bottom"
          style={{ height: safeHeight("bottom", insets.bottom), backgroundColor: c.surface }}
        />
      </View>
    </View>
  );
}
