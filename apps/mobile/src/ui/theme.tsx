import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";

// Neutral, swappable design tokens until the Viswatra identity is approved (Goal 10A.2; blocker.txt).
// Mock-up palette (owner reference image, 2026-10-24): white surfaces, LensMate blue, soft tinted tiles.
const light = {
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  surface2: "#EEF3FB",
  border: "rgba(16,42,94,0.08)",
  text: "#0B1B3F",
  muted: "#6B7A99",
  accent: "#1E6BFF",
  accentInk: "#FFFFFF",
  accent2: "#F59E0B",
  danger: "#EF4444",
  live: "#EF4444",
  glow: "rgba(30,107,255,0.10)",
  ok: "#22C55E",
  okBg: "#E9F9EF",
  tintBlue: "#EAF1FF",
  tintRed: "#FFF0F0",
  tintIndigo: "#EEF0FF",
  tintAmber: "#FFF6E5",
};

const dark: typeof light = {
  bg: "#070B14",
  surface: "#101726",
  surface2: "#172036",
  border: "rgba(255,255,255,0.08)",
  text: "#EEF3FF",
  muted: "#8C9AB8",
  accent: "#4C8DFF",
  accentInk: "#FFFFFF",
  accent2: "#FBBF24",
  danger: "#F87171",
  live: "#EF4444",
  glow: "rgba(76,141,255,0.16)",
  ok: "#34D399",
  okBg: "rgba(52,211,153,0.12)",
  tintBlue: "rgba(76,141,255,0.14)",
  tintRed: "rgba(248,113,113,0.14)",
  tintIndigo: "rgba(129,140,248,0.14)",
  tintAmber: "rgba(251,191,36,0.14)",
};

type Palette = typeof light;

export const FONTS = {
  display:
    Platform.OS === "web" ? "'Bricolage Grotesque', 'Noto Sans Telugu', sans-serif" : undefined,
  body: Platform.OS === "web" ? "'Figtree', 'Noto Sans Telugu', sans-serif" : undefined,
  mono: Platform.OS === "web" ? "'JetBrains Mono', monospace" : undefined,
};

const ThemeContext = createContext<{ c: Palette; dark: boolean }>({ c: light, dark: false });

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&family=Noto+Sans+Telugu:wght@400;600&display=swap";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useColorScheme() === "dark";
  useEffect(() => {
    if (Platform.OS !== "web" || document.getElementById("lm-fonts") !== null) {
      return;
    }
    const link = document.createElement("link");
    link.id = "lm-fonts";
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") {
      document.body.style.backgroundColor = (isDark ? dark : light).bg;
    }
  }, [isDark]);
  return (
    <ThemeContext.Provider value={{ c: isDark ? dark : light, dark: isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
