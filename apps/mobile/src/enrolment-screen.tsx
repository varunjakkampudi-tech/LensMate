import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { BrokerConfig } from "./broker-config";
import {
  clearDeviceCredential,
  CredentialStorageError,
  EnrolmentError,
  enrolThisDevice,
  loadDeviceCredential,
  type CredentialStorage,
} from "./device-credential";
import { STRINGS } from "./strings";

const T = STRINGS.enrolment;

// The owner's codes use this alphabet (services/broker/src/devices.ts): no I, L, O, U, 0 or 1.
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{16}$/;
const LABEL_PATTERN = /^[A-Za-z0-9 ._-]{1,64}$/;

/** Accepts the code with or without its dashes and spaces, in any case. Returns null when it cannot be a code. */
export function normaliseCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_PATTERN.test(compact) ? compact : null;
}

function fill(text: string, deviceId: string): string {
  return text.split("{id}").join(deviceId);
}

type Notice = { readonly tone: "success" | "error"; readonly text: string };

export interface EnrolmentScreenProps {
  readonly config: BrokerConfig;
  readonly onClose: () => void;
  /** Injected in tests. Defaults to secure device storage and the network. */
  readonly storage?: CredentialStorage;
  readonly doFetch?: typeof fetch;
}

export function EnrolmentScreen({ config, onClose, storage, doFetch }: EnrolmentScreenProps) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // What is already stored on this phone. Enrolment is blocked while anything is stored.
  const [stored, setStored] = useState<
    { readonly kind: "enrolled"; readonly deviceId: string } | { readonly kind: "invalid" } | null
  >(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // A stored credential, or a credential store that cannot be read, locks enrolment. Nothing is overwritten then.
  const [readFailed, setReadFailed] = useState(false);
  const blocked = stored !== null || readFailed;
  // A ref, not state, so a second press in the same frame cannot start a second request.
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    loadDeviceCredential(storage)
      .then((state) => {
        if (!active) {
          return;
        }
        if (state.status === "enrolled") {
          setStored({ kind: "enrolled", deviceId: state.credential.deviceId });
        } else if (state.status === "invalid") {
          setStored({ kind: "invalid" });
        }
      })
      .catch(() => {
        if (active) {
          setReadFailed(true);
          setNotice({ tone: "error", text: T.errors.READ_FAILED });
        }
      });
    return () => {
      active = false;
    };
  }, [storage]);

  if (!config.ok) {
    const text = config.reason === "NOT_CONFIGURED" ? T.notConfigured : T.configInvalid;
    return (
      <View style={styles.screen}>
        <Text accessibilityRole="header" style={styles.title}>
          {T.title}
        </Text>
        <Text accessibilityRole="alert">{text}</Text>
        <BackButton onPress={onClose} />
      </View>
    );
  }

  const baseUrl = config.baseUrl;

  async function submit() {
    if (submitting.current) {
      return;
    }
    const normalised = normaliseCode(code);
    const trimmedLabel = label.trim();
    // The code is cleared on every attempt, so it does not stay on screen after it is used.
    setCode("");
    if (normalised === null) {
      setNotice({ tone: "error", text: T.codeFormat });
      return;
    }
    if (!LABEL_PATTERN.test(trimmedLabel)) {
      setNotice({ tone: "error", text: T.labelFormat });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await enrolThisDevice(baseUrl, normalised, trimmedLabel, storage, doFetch);
      setStored({ kind: "enrolled", deviceId: result.deviceId });
      setNotice({ tone: "success", text: fill(T.enrolled, result.deviceId) });
    } catch (error) {
      setNotice({ tone: "error", text: describeFailure(error) });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function removeDamaged() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setConfirmRemove(false);
    try {
      await clearDeviceCredential(storage);
      setStored(null);
      setNotice({ tone: "success", text: T.removed });
    } catch (error) {
      setNotice({ tone: "error", text: describeFailure(error) });
    }
  }

  const storedText =
    stored === null
      ? null
      : stored.kind === "enrolled"
        ? fill(T.alreadyEnrolled, stored.deviceId)
        : T.invalidCredential;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {T.title}
      </Text>
      <Text>{T.intro}</Text>
      {storedText === null ? null : <Text accessibilityRole="alert">{storedText}</Text>}
      {stored?.kind === "invalid" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void removeDamaged();
          }}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>
            {confirmRemove ? T.removeConfirm : T.removeInvalid}
          </Text>
        </Pressable>
      ) : null}

      <Text nativeID="enrol-code-label">{T.codeLabel}</Text>
      <TextInput
        accessibilityLabel={T.codeLabel}
        accessibilityHint={T.codeHint}
        accessibilityLabelledBy="enrol-code-label"
        value={code}
        onChangeText={setCode}
        editable={!busy && !blocked}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="default"
        maxLength={40}
        placeholder="ABCD-EFGH-JKMN-PQRS"
        placeholderTextColor="#9AA8C3"
        style={styles.input}
      />
      <Text>{T.codeHint}</Text>

      <Text nativeID="enrol-label-label">{T.labelLabel}</Text>
      <TextInput
        accessibilityLabel={T.labelLabel}
        accessibilityHint={T.labelHint}
        accessibilityLabelledBy="enrol-label-label"
        value={label}
        onChangeText={setLabel}
        editable={!busy && !blocked}
        autoCorrect={false}
        maxLength={64}
        style={styles.input}
      />
      <Text>{T.labelHint}</Text>
      <Text>{T.reinstallNote}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || blocked, busy }}
        disabled={busy || blocked}
        onPress={() => {
          void submit();
        }}
        style={[styles.primary, busy || blocked ? styles.disabled : null]}
      >
        <Text style={styles.primaryText}>{busy ? T.submitting : T.submit}</Text>
      </Pressable>

      <View accessibilityLiveRegion="polite">
        {notice === null ? null : (
          <Text accessibilityRole={notice.tone === "error" ? "alert" : "text"}>{notice.text}</Text>
        )}
      </View>

      <BackButton onPress={onClose} />
    </ScrollView>
  );
}

function BackButton({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryText}>{T.back}</Text>
    </Pressable>
  );
}

/** Maps an error to fixed, user-safe text. Never includes a code, a secret or platform error text. */
function describeFailure(error: unknown): string {
  if (error instanceof EnrolmentError) {
    const text = T.errors[error.failure as keyof typeof T.errors] ?? T.errors.FAILED;
    return error.deviceId === undefined ? text : fill(text, error.deviceId);
  }
  if (error instanceof CredentialStorageError) {
    return T.errors[error.failure];
  }
  return T.errors.FAILED;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#1E6BFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 18,
  },
  primary: {
    minHeight: 48,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#1E6BFF",
    justifyContent: "center",
  },
  primaryText: { color: "#ffffff", textAlign: "center" },
  disabled: { opacity: 0.5 },
  secondary: {
    minHeight: 48,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E6BFF",
    justifyContent: "center",
  },
  secondaryText: { color: "#1E6BFF", textAlign: "center" },
});
