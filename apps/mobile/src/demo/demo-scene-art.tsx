import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { DemoScene, SceneShape } from "./demo-catalogue";
import { DEMO } from "./demo-strings";

const FILL: Readonly<Record<SceneShape["tone"], string>> = {
  blue: "#1E6BFF",
  white: "#ffffff",
  grey: "#9aa5b1",
  ink: "#2b2b2b",
};

/**
 * A synthetic picture of a scene, built in code from plain shapes. It is not a photograph and shows no
 * people. Each shape is placed as a percentage of the frame, so the picture scales to the screen width.
 */
export function SceneArt({
  scene,
  description,
}: {
  readonly scene: DemoScene;
  readonly description: string;
}) {
  return (
    <View accessible accessibilityLabel={`${DEMO.sceneLabel}: ${description}`} style={styles.frame}>
      {scene.shapes.map((shape, index) => (
        <View key={String(index)} style={shapeStyle(shape)}>
          {shape.text === undefined ? null : (
            <Text
              style={[
                styles.shapeText,
                shape.tone === "blue" ? styles.textOnBlue : styles.textOnLight,
                shape.align === "center" ? styles.textCenter : null,
              ]}
            >
              {shape.text}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function shapeStyle(shape: SceneShape): ViewStyle {
  return {
    position: "absolute",
    left: `${String(shape.x)}%`,
    top: `${String(shape.y)}%`,
    width: `${String(shape.w)}%`,
    height: `${String(shape.h)}%`,
    backgroundColor: shape.kind === "text" ? "transparent" : FILL[shape.tone],
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 4,
  };
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 5 / 3,
    backgroundColor: "#e8edf2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E6BFF",
    overflow: "hidden",
  },
  shapeText: { fontSize: 13, fontWeight: "600" },
  textOnBlue: { color: "#ffffff" },
  textOnLight: { color: "#0B1B3F" },
  textCenter: { textAlign: "center" },
});
