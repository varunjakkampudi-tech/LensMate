import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

export type Profile = "personal" | "blind" | "hearing" | "custom";
export type Lang = "en" | "te";

export interface Prefs {
  readonly profile: Profile;
  readonly language: Lang;
  readonly autoSpeak: boolean;
  readonly largeCaptions: boolean;
  readonly detailedDescriptions: boolean;
  readonly voiceRate: number;
  readonly features: Readonly<Record<FeatureKey, boolean>>;
}

export const FEATURES = {
  vision: "Vision help",
  talk: "Voice questions",
  translate: "Live translation",
  memory: "Notes and memory",
  reminders: "Reminders",
  checks: "Mistake checks",
  interview: "Interview practice",
} as const;
export type FeatureKey = keyof typeof FEATURES;

const ALL_ON = {
  vision: true,
  talk: true,
  translate: true,
  memory: true,
  reminders: true,
  checks: true,
  interview: true,
};

const PRESETS: Record<Exclude<Profile, "custom">, Omit<Prefs, "language" | "profile">> = {
  personal: {
    autoSpeak: false,
    largeCaptions: false,
    detailedDescriptions: false,
    voiceRate: 1,
    features: ALL_ON,
  },
  blind: {
    autoSpeak: true,
    largeCaptions: false,
    detailedDescriptions: true,
    voiceRate: 1.1,
    features: { ...ALL_ON, interview: false },
  },
  hearing: {
    autoSpeak: false,
    largeCaptions: true,
    detailedDescriptions: false,
    voiceRate: 1,
    features: { ...ALL_ON, interview: false },
  },
};

const DEFAULT: Prefs = { profile: "personal", language: "en", ...PRESETS.personal };
const KEY = "lensmate.prefs.v1";

const Ctx = createContext<{
  prefs: Prefs;
  update: (patch: Partial<Prefs>) => void;
  applyProfile: (p: Profile) => void;
}>({
  prefs: DEFAULT,
  update: () => undefined,
  applyProfile: () => undefined,
});

function load(): Prefs {
  if (Platform.OS !== "web") {
    return DEFAULT;
  }
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    return raw === null ? DEFAULT : { ...DEFAULT, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT;
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    if (Platform.OS === "web") {
      globalThis.localStorage.setItem(KEY, JSON.stringify(prefs));
    }
  }, [prefs]);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => ({ ...current, ...patch, profile: patch.profile ?? "custom" }));
  }, []);
  const applyProfile = useCallback((profile: Profile) => {
    setPrefs((current) =>
      profile === "custom" ? { ...current, profile } : { ...current, ...PRESETS[profile], profile },
    );
  }, []);
  return <Ctx.Provider value={{ prefs, update, applyProfile }}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  return useContext(Ctx);
}
