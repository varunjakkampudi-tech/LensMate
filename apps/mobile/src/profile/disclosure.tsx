import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../ui/icon";
import { Card } from "../ui/kit";
import { FONTS, useTheme } from "../ui/theme";

/** An expandable Profile section. The header is a button; its content renders only while open. */
export function Disclosure({
  testID,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  testID: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ color: c.text, fontFamily: FONTS.display, fontSize: 17, fontWeight: "700" }}
          >
            {title}
          </Text>
          {summary === undefined ? null : (
            <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 13 }}>{summary}</Text>
          )}
        </View>
        <View
          style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
          accessibilityElementsHidden
        >
          <Icon name="arrow" color={c.muted} size={18} />
        </View>
      </Pressable>
      {open ? <View style={{ gap: 10, marginTop: 10 }}>{children}</View> : null}
    </Card>
  );
}
