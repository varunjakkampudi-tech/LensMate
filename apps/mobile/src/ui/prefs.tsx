import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

export type Profile = "personal" | "blind" | "hearing" | "custom";
/** Languages offered for speech and answers. Speech quality depends on the device's speech engine. */
export const LANGS = {
  en: { name: "English", native: "English", locale: "en-IN" },
  te: { name: "Telugu", native: "తెలుగు", locale: "te-IN" },
  hi: { name: "Hindi", native: "हिन्दी", locale: "hi-IN" },
  ta: { name: "Tamil", native: "தமிழ்", locale: "ta-IN" },
  kn: { name: "Kannada", native: "ಕನ್ನಡ", locale: "kn-IN" },
  ml: { name: "Malayalam", native: "മലയാളം", locale: "ml-IN" },
  mr: { name: "Marathi", native: "मराठी", locale: "mr-IN" },
  bn: { name: "Bengali", native: "বাংলা", locale: "bn-IN" },
  gu: { name: "Gujarati", native: "ગુજરાતી", locale: "gu-IN" },
  pa: { name: "Punjabi", native: "ਪੰਜਾਬੀ", locale: "pa-IN" },
  ur: { name: "Urdu", native: "اردو", locale: "ur-IN" },
  es: { name: "Spanish", native: "Español", locale: "es-ES" },
  fr: { name: "French", native: "Français", locale: "fr-FR" },
  de: { name: "German", native: "Deutsch", locale: "de-DE" },
  pt: { name: "Portuguese", native: "Português", locale: "pt-BR" },
  ar: { name: "Arabic", native: "العربية", locale: "ar-SA" },
  zh: { name: "Chinese", native: "中文", locale: "zh-CN" },
  ja: { name: "Japanese", native: "日本語", locale: "ja-JP" },
  ko: { name: "Korean", native: "한국어", locale: "ko-KR" },
  ru: { name: "Russian", native: "Русский", locale: "ru-RU" },
} as const;
export type Lang = keyof typeof LANGS;

/** How LensMate phrases answers. Warm is the default; brief is one or two sentences; formal avoids slang. */
export type Tone = "warm" | "brief" | "formal";
export const TONES: readonly Tone[] = ["warm", "brief", "formal"];
export const TONE_LABEL: Record<Tone, string> = { warm: "Warm", brief: "Brief", formal: "Formal" };

export interface Prefs {
  readonly profile: Profile;
  readonly tone: Tone;
  readonly language: Lang;
  readonly autoSpeak: boolean;
  readonly largeCaptions: boolean;
  readonly detailedDescriptions: boolean;
  readonly voiceRate: number;
}

const PRESETS: Record<Exclude<Profile, "custom">, Omit<Prefs, "language" | "profile">> = {
  personal: {
    tone: "warm",
    autoSpeak: false,
    largeCaptions: false,
    detailedDescriptions: false,
    voiceRate: 1,
  },
  blind: {
    tone: "warm",
    autoSpeak: true,
    largeCaptions: false,
    detailedDescriptions: true,
    voiceRate: 1.1,
  },
  hearing: {
    tone: "warm",
    autoSpeak: false,
    largeCaptions: true,
    detailedDescriptions: false,
    voiceRate: 1,
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
