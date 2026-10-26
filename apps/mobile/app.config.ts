import type { ExpoConfig } from "expo/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Expo reads .env files only from this folder. The repository keeps its development settings one level up, so copy
// the public EXPO_PUBLIC_ values from there when they are not already set. Nothing else is copied: secrets such as the
// OpenRouter key never enter the app environment this way.
const rootEnvFile = join(
  typeof __dirname === "undefined" ? process.cwd() : __dirname,
  "..",
  "..",
  ".env.development",
);
if (existsSync(rootEnvFile)) {
  for (const line of readFileSync(rootEnvFile, "utf8").split(/\r?\n/)) {
    const match = /^(EXPO_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match !== null && match[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
}

// Continuous Native Generation: native settings live here and in config plugins.
// ios/ and android/ are generated and never hand-edited.
const config: ExpoConfig = {
  name: "LensMate",
  slug: "lensmate",
  version: "0.0.0",
  scheme: "lensmate",
  icon: "./assets/icon.png",
  orientation: "portrait",
  // Installable web app (Add to Home Screen on iPhone). The manifest carries no secrets: it is public by design.
  web: {
    // Single-page output: the bundle must load on every page. (Static output left the bundle script out, so the app
    // rendered but could not respond.) The iPhone head tags are added at runtime by src/pwa/web-head.ts.
    output: "single",
    name: "LensMate",
    shortName: "LensMate",
    description: "Smart-glasses help for seeing, hearing and talking. Works in your browser.",
    lang: "en",
    display: "standalone",
    orientation: "portrait",
    startUrl: "/",
    themeColor: "#0B0F1A",
    backgroundColor: "#0B0F1A",
    barStyle: "black-translucent",
    favicon: "./assets/favicon.png",
  },
  ios: {
    bundleIdentifier: "com.viswatra.lensmate",
    supportsTablet: false,
  },
  android: {
    package: "com.viswatra.lensmate",
    allowBackup: false,
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-secure-store",
    // Native permissions. Without these the Android build cannot ask for the camera or microphone, and an iPhone build
    // would close when it first uses them. The text is what the phone shows the owner.
    [
      "expo-camera",
      {
        cameraPermission:
          "LensMate uses the camera only while the See screen is open, to answer questions about what you point it at.",
        microphonePermission:
          "LensMate uses the microphone only when you press to speak or start a voice session.",
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission: "LensMate uses the microphone only when you press to speak.",
        speechRecognitionPermission:
          "LensMate turns your speech into text on this phone when you press to speak.",
      },
    ],
    "expo-notifications",
    // Encrypts the memory database (native-store.ts). Applies only to a native build made after this change.
    ["expo-sqlite", { useSQLCipher: true }],
  ],
  experiments: {
    typedRoutes: true,
    // Set only for the browser build served under a path, for example /app. Unset keeps the root path.
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
  extra: {
    eas: {
      projectId: "2fb3599f-8a9d-4f26-85c0-ad9669a6f23b",
    },
    // When this config was evaluated: the build time shown on the home screen (src/build-info.ts).
    builtAt: new Date().toISOString(),
  },
};

export default config;
