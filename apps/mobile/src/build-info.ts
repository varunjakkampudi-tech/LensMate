import Constants from "expo-constants";

/**
 * When this build was made. The browser export reads EXPO_PUBLIC_BUILT_AT, which the export command sets to the build
 * time (Expo puts it into the bundle). Native builds and the config fallback read the time app.config.ts recorded.
 * Shown on the home screen so the owner can tell whether the copy on the phone is the latest.
 */
export function builtAtIso(): string | null {
  const candidates: unknown[] = [
    process.env.EXPO_PUBLIC_BUILT_AT,
    Constants.expoConfig?.extra?.["builtAt"],
  ];
  for (const value of candidates) {
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
      return value;
    }
  }
  return null;
}

/** One plain line in the phone's own time zone, for example "Last deployed: 26 Oct 2026, 6:14 pm". */
export function formatBuildLine(iso: string | null): string {
  if (iso === null) {
    return "Build time not recorded";
  }
  const when = new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return `Last deployed: ${when}`;
}
