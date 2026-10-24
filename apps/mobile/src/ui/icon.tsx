import { createElement } from "react";
import { Platform, Text } from "react-native";

// Stroke icons (24px grid). Web renders SVG; native shows a letter until an icon set is approved.
const PATHS = {
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M19 11a7 7 0 0 1-14 0 M12 18v3",
  globe:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z",
  brain:
    "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1Z M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1",
  home: "M3 11 12 4l9 7 M5 10v10h14V10",
  sliders: "M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4",
  camera: "M4 8h3l2-3h6l2 3h3v11H4Z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  stop: "M7 7h10v10H7Z",
  glasses:
    "M2 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z M14 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z M10 13c.6-.8 1.3-1 2-1s1.4.2 2 1 M2 13l1-6 M22 13l-1-6",
  speaker: "M4 9h4l5-4v14l-5-4H4Z M17 9a4 4 0 0 1 0 6 M19.5 6.5a8 8 0 0 1 0 11",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z M9 12l2 2 4-4",
  spark:
    "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M6 18l2.5-2.5 M15.5 8.5 18 6",
  check: "M5 12l4 4 10-10",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z M10 20a2 2 0 0 0 4 0",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  back: "M19 12H5 M11 6l-6 6 6 6",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21a8 8 0 0 1 16 0",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  x: "M6 6l12 12 M18 6 6 18",
  send: "M5 12h14 M13 6l6 6-6 6",
  image: "M4 5h16v14H4Z M4 16l5-5 4 4 3-3 4 4 M15 9.5a1.5 1.5 0 1 0 0-.01",
  flip: "M4 8h3l2-3h6l2 3h3v11H4Z M9 13a3 3 0 0 1 5-2 M15 13a3 3 0 0 1-5 2 M14 9v2h-2 M10 17v-2h2",
  keyboard: "M3 6h18v12H3Z M7 10h0 M11 10h0 M15 10h0 M7 14h10",
  copy: "M8 8h12v12H8Z M4 16V4h12",
  swap: "M4 8h14 M14 4l4 4-4 4 M20 16H6 M10 12l-4 4 4 4",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M20 20l-4-4",
  agent:
    "M12 2v3 M8 5h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z M9 11h.01 M15 11h.01 M9 15h6 M2 11v3 M22 11v3",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7Z",
  phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z",
  pin: "M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z M12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  note: "M6 3h9l4 4v14H6Z M14 3v5h5 M9 12h7 M9 16h7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  if (Platform.OS !== "web") {
    return (
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={{ color, fontSize: size * 0.7, fontWeight: "700" }}
      >
        {name[0]?.toUpperCase()}
      </Text>
    );
  }
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    createElement("path", { d: PATHS[name] }),
  );
}
