import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

// react-native-web renders dataSet as data-* attributes; React Native's types do not declare it.
const LEGACY_MARK = { dataSet: { lmLegacy: "1" } } as object;

/** Wraps a pre-redesign screen so the web stylesheet gives it the app font. */
export function LegacySurface({ style, children }: { style: ViewStyle; children: ReactNode }) {
  return (
    <View {...LEGACY_MARK} style={style}>
      {children}
    </View>
  );
}
