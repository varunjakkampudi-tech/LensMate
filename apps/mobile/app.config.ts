import type { ExpoConfig } from "expo/config";

// Continuous Native Generation: native settings live here and in config plugins.
// ios/ and android/ are generated and never hand-edited (Engineering Standards 1).
const config: ExpoConfig = {
  name: "LensMate",
  slug: "lensmate",
  version: "0.0.0",
  scheme: "lensmate",
  orientation: "portrait",
  ios: {
    bundleIdentifier: "com.viswatra.lensmate",
    supportsTablet: false,
  },
  android: {
    package: "com.viswatra.lensmate",
    allowBackup: false,
  },
  plugins: ["expo-router", "expo-dev-client", "expo-secure-store"],
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
