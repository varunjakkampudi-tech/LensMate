import type { ExpoConfig } from "expo/config";

// Continuous Native Generation: native settings live here and in config plugins.
// ios/ and android/ are generated and never hand-edited (Engineering Standards 1).
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
    // Encrypts the memory database (native-store.ts). Applies only to a native build made after this change.
    ["expo-sqlite", { useSQLCipher: true }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "2fb3599f-8a9d-4f26-85c0-ad9669a6f23b",
    },
  },
};

export default config;
