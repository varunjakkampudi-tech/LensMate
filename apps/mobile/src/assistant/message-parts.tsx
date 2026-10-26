import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import type { AgentStep, PhoneAction } from "../ai/agent";
import { Icon, type IconName } from "../ui/icon";
import { FONTS, useTheme } from "../ui/theme";

type Source = "mock" | "openrouter";

export interface Message {
  readonly id: number;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly steps?: readonly AgentStep[];
  readonly actions?: readonly PhoneAction[];
  readonly source?: Source;
  /** A failed request. The retry re-sends the question that caused it. */
  readonly failedQuestion?: string;
}

const AGENT_ICON: Record<AgentStep["agent"], IconName> = {
  Planner: "agent",
  Researcher: "search",
  "Memory keeper": "brain",
  Scheduler: "bell",
  "Action agent": "bolt",
  Translator: "globe",
  Writer: "note",
};

/** Five bars that move while listening or speaking. Restrained: slow and small. */
export function WaveBars({ active, color }: { active: boolean; color: string }) {
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.35))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.35));
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 420 + i * 60, useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.35, duration: 420 + i * 60, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars]);
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 18 }}
      accessibilityElementsHidden
    >
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: 18,
            borderRadius: 2,
            backgroundColor: color,
            transform: [{ scaleY: b }],
          }}
        />
      ))}
    </View>
  );
}

export function Bubble({
  message,
  isLast,
  onReplay,
  onRetry,
  onConfirm,
}: {
  message: Message;
  isLast: boolean;
  onReplay: () => void;
  onRetry: () => void;
  onConfirm: (a: PhoneAction) => void;
}) {
  const { c } = useTheme();
  const mine = message.role === "user";
  const failed = message.failedQuestion !== undefined;
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 6 }}>
      <View
        testID={mine ? "talk-turn-user" : failed ? "talk-turn-error" : "talk-turn-assistant"}
        accessibilityLabel={`${mine ? "You" : "Assistant"}: ${message.text}`}
        style={{
          maxWidth: "86%",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 4 : 18,
          borderBottomLeftRadius: mine ? 18 : 4,
          backgroundColor: mine ? c.accent : failed ? c.surface2 : c.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: failed ? c.danger : c.border,
        }}
      >
        <Text
          style={{
            color: mine ? c.accentInk : c.text,
            fontFamily: FONTS.body,
            fontSize: 15,
            lineHeight: 21,
          }}
        >
          {message.text}
        </Text>
      </View>
      {message.steps !== undefined && message.steps.length > 0 ? (
        <View style={{ maxWidth: "86%", gap: 4, paddingLeft: 4 }}>
          {message.steps.map((s, i) => (
            <View
              key={i}
              testID="agent-step"
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Icon
                name={AGENT_ICON[s.agent]}
                color={s.status === "done" ? c.accent : c.danger}
                size={14}
              />
              <Text
                style={{ flex: 1, color: c.muted, fontFamily: FONTS.body, fontSize: 12 }}
                numberOfLines={2}
              >
                {s.agent}: {s.summary}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {!mine && message.source !== undefined ? (
        <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 11, paddingLeft: 4 }}>
          {message.source === "mock" ? "Mock answer · no provider called" : "Live provider answer"}
        </Text>
      ) : null}
      {!mine &&
        (message.actions ?? []).map((a) => (
          <Pressable
            key={a.url}
            accessibilityRole="button"
            accessibilityLabel={`Confirm: ${a.label}`}
            testID="agent-action"
            onPress={() => onConfirm(a)}
            style={{
              minHeight: 48,
              paddingHorizontal: 14,
              justifyContent: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.accent,
            }}
          >
            <Text
              style={{ color: c.accent, fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}
            >
              Confirm: {a.label}
            </Text>
          </Pressable>
        ))}
      {!mine && failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          testID="talk-retry-button"
          onPress={onRetry}
          style={{ minHeight: 48, justifyContent: "center", paddingLeft: 4 }}
        >
          <Text
            style={{ color: c.accent, fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}
          >
            Try again
          </Text>
        </Pressable>
      ) : null}
      {!mine && !failed && isLast ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replay answer aloud"
          testID="talk-replay-button"
          onPress={onReplay}
          style={{
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingLeft: 4,
          }}
        >
          <Icon name="speaker" color={c.accent} size={16} />
          <Text
            style={{ color: c.accent, fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}
          >
            Replay
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
