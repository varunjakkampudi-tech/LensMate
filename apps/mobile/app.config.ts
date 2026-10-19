import type { ExpoConfig } from "expo/config";

// Continuous Native Generation: native settings live here and in config plugins.
// ios/ and android/ are generated and never hand-edited (Engineering Standards 1).
const config: ExpoConfig = {
  name: "SmartGlass",
  slug: "smartglass",
  version: "0.0.0",
  scheme: "smartglass",
  orientation: "portrait",
  ios: {
    bundleIdentifier: "com.viswatra.smartglass",
    supportsTablet: false,
  },
  android: {
    package: "com.viswatra.smartglass",
    allowBackup: false,
  },
  plugins: ["expo-router", "expo-dev-client"],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
