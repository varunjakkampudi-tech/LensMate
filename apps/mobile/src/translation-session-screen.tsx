import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { silenceRemainingMs } from "@lensmate/core";
import {
  formatCountdown,
  indicatorText,
  type ListeningKind,
  type TranslationSessionModel,
} from "./translation-session-model";
import { useTranslationSession, type TranslationSessionLink } from "./use-translation-session";
import { STRINGS } from "./strings";

const T = STRINGS.translationSession;

const defaultClock = (): number => performance.now();

export interface TranslationSessionScreenProps {
  /** The glasses link. The screen never opens a network connection of its own. */
  readonly link: TranslationSessionLink;
  /** Injected in tests. Defaults to the device clock, which is the clock the glasses use in the simulator. */
  readonly clock?: () => number;
  readonly tickMs?: number;
}

/**
 * Translation and caption session screen. Start and stop buttons, the recording indicator as text, the
 * announcement as a status line, the silence countdown, and the caption area. Taps on the glasses are not handled
 * here: they have no effect in a translation session.
 */
export function TranslationSessionScreen({
  link,
  clock = defaultClock,
  tickMs,
}: TranslationSessionScreenProps) {
  const session = useTranslationSession(link, clock, tickMs);
  const { model, linkStatus, connecting, pending, error, now } = session;
  const connected = linkStatus === "connected";
  const running = model.session;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {T.title}
      </Text>
      <Text style={styles.body}>{T.intro}</Text>

      {connecting ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel={T.connecting} />
          <Text style={styles.body}>{T.connecting}</Text>
        </View>
      ) : (
        <Text style={styles.body}>{connected ? T.glassesConnected : T.glassesOffline}</Text>
      )}
      {!connected && !connecting ? (
        <ActionButton label={T.connect} onPress={() => void session.connect()} />
      ) : null}

      <Text style={styles.body}>{indicatorText(model)}</Text>

      <View style={styles.status} accessibilityLiveRegion="polite" accessibilityRole="text">
        <Text style={styles.statusText}>{statusText(model, connected)}</Text>
      </View>

      {running !== null && model.silence !== null ? (
        <Text style={styles.body}>
          {T.countdown(formatCountdown(silenceRemainingMs(model.silence, now)))}
        </Text>
      ) : null}

      {pending !== null ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel={pending === "START" ? T.starting : T.stopping} />
          <Text style={styles.body}>{pending === "START" ? T.starting : T.stopping}</Text>
        </View>
      ) : null}

      {error !== null ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {running === null ? (
          <>
            {/* Not disabled while another capture runs: the glasses refuse, and the error says why. */}
            <ActionButton
              label={T.startTranslation}
              disabled={!connected || pending !== null}
              onPress={() => void session.start("TRANSLATION")}
            />
            <ActionButton
              label={T.startCaptions}
              disabled={!connected || pending !== null}
              onPress={() => void session.start("CAPTION")}
            />
          </>
        ) : (
          <ActionButton
            label={stopLabel(running)}
            disabled={pending !== null}
            onPress={() => void session.stop()}
          />
        )}
      </View>

      <Text accessibilityRole="header" style={styles.subtitle}>
        {T.captionsTitle}
      </Text>
      {model.captions.length === 0 ? (
        <Text style={styles.body}>{T.noCaptions}</Text>
      ) : (
        model.captions.map((caption, index) => (
          // Captions only grow during a session and are never reordered, so the index is a stable key.
          <Text key={String(index)} style={styles.caption}>
            {caption}
          </Text>
        ))
      )}
    </ScrollView>
  );
}

function stopLabel(session: ListeningKind): string {
  return session === "TRANSLATION" ? T.stopTranslation : T.stopCaptions;
}

/** The status line: what is happening now, in words. The announcement is shown here while translation runs. */
function statusText(
  model: Pick<TranslationSessionModel, "session" | "announcement" | "endedBy" | "indicatorOn">,
  connected: boolean,
): string {
  if (!connected) {
    return T.offlineAction;
  }
  if (model.session === "TRANSLATION") {
    return model.announcement ?? T.translationRunning;
  }
  if (model.session === "CAPTION") {
    return T.captionsRunning;
  }
  if (model.indicatorOn) {
    return T.otherCapture;
  }
  if (model.endedBy !== null) {
    return T.ended[model.endedBy];
  }
  return T.idle;
}

interface ActionButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

function ActionButton({ label, onPress, disabled = false }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  subtitle: { fontSize: 18, fontWeight: "600", marginTop: 8 },
  body: { fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  status: {
    minHeight: 48,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E6BFF",
  },
  statusText: { fontSize: 18 },
  error: { fontSize: 16, color: "#8a1c1c" },
  actions: { gap: 12 },
  button: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 999,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E6BFF",
  },
  buttonDisabled: { backgroundColor: "#7a8a99" },
  buttonText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  caption: { fontSize: 18, paddingVertical: 4 },
});
