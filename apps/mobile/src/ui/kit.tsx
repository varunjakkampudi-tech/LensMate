import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { Icon, type IconName } from "./icon";
import { FONTS, useTheme } from "./theme";

export function Page({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
    >
      <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 18 }}>
        {kicker === undefined ? null : (
          <Text style={{ color: c.accent, fontFamily: FONTS.mono, fontSize: 12, letterSpacing: 2 }}>
            {kicker}
          </Text>
        )}
        <Text
          accessibilityRole="header"
          style={{
            color: c.text,
            fontFamily: FONTS.display,
            fontSize: 30,
            fontWeight: "800",
            letterSpacing: -0.8,
          }}
        >
          {title}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  glow,
  testID,
}: {
  children: ReactNode;
  testID?: string;
  style?: ViewStyle;
  glow?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: c.surface,
          borderColor: glow === true ? c.accent : c.border,
          borderWidth: 1,
          borderRadius: 20,
          padding: 18,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function H2({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Text style={{ color: c.text, fontFamily: FONTS.display, fontSize: 18, fontWeight: "700" }}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  size,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: number;
}) {
  const { c } = useTheme();
  return (
    <Text
      style={{
        color: muted === true ? c.muted : c.text,
        fontFamily: FONTS.body,
        fontSize: size ?? 15,
        lineHeight: (size ?? 15) * 1.5,
      }}
    >
      {children}
    </Text>
  );
}

type Tone = "primary" | "ghost" | "danger";

export function Btn(props: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const tone = props.tone ?? "primary";
  const bg = tone === "primary" ? c.accent : tone === "danger" ? c.danger : "transparent";
  const fg = tone === "primary" ? c.accentInk : tone === "danger" ? "#fff" : c.text;
  const off = props.disabled === true || props.busy === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: off }}
      testID={props.testID}
      disabled={off}
      onPress={props.onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 18,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: tone === "ghost" ? 1 : 0,
        borderColor: c.border,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: off ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {props.busy === true ? (
        <ActivityIndicator color={fg} />
      ) : props.icon === undefined ? null : (
        <Icon name={props.icon} color={fg} size={18} />
      )}
      <Text style={{ color: fg, fontFamily: FONTS.body, fontWeight: "600", fontSize: 15 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, checked: active }}
      aria-checked={active}
      testID={testID}
      onPress={onPress}
      style={{
        minHeight: 48,
        justifyContent: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? c.accent : c.border,
        backgroundColor: active ? c.glow : "transparent",
      }}
    >
      <Text
        style={{
          color: active ? c.accent : c.muted,
          fontFamily: FONTS.body,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  secure?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 13 }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        testID={props.testID}
        value={props.value}
        onChangeText={props.onChange}
        multiline={props.multiline}
        secureTextEntry={props.secure}
        placeholder={props.placeholder}
        placeholderTextColor={c.muted}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          minHeight: props.multiline === true ? 96 : 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: focus ? c.accent : c.border,
          backgroundColor: c.surface2,
          color: c.text,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontFamily: FONTS.body,
          fontSize: 16,
          textAlignVertical: "top",
        }}
      />
    </View>
  );
}

export function Notice({
  tone,
  children,
  testID,
}: {
  tone: "info" | "warn" | "error";
  children: ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  const color = tone === "error" ? c.danger : tone === "warn" ? c.accent2 : c.accent;
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      testID={testID}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: color,
        backgroundColor: c.surface2,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 14, lineHeight: 21 }}>
        {children}
      </Text>
    </View>
  );
}

export function Row({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        flexWrap: wrap === false ? "nowrap" : "wrap",
      }}
    >
      {children}
    </View>
  );
}
