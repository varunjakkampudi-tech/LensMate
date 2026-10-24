import { useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import {
  importMeasurementCsv,
  summarizeEvidence,
  type ImportableEvidenceLevel,
  type Language,
  type MeasurementRecord,
  type NetworkType,
  type RunByRole,
} from "@lensmate/core";
import {
  EMPTY_PROVENANCE,
  EVIDENCE_CHOICES,
  LANGUAGE_CHOICES,
  MEASURE_ENTRIES,
  NETWORK_CHOICES,
  RUN_BY_CHOICES,
  languageLabel,
  provenanceProblems,
  tallyTries,
  toRecorderContext,
  type ProvenanceForm,
} from "./measurement-session";
import {
  CAPTURE_TRIGGER_ACTION,
  CaptureToPhoneRecorder,
  type TimedGlasses,
} from "./measurement-recorder";
import { STRINGS } from "./strings";
import { createVirtualGlasses } from "./virtual-glasses-link";

const TEXT = STRINGS.measurement;

/** Glasses that can also receive simulated button input (the virtual glasses today). */
export type SimulatedGlasses = TimedGlasses & { pressButton(action: string): void };

export interface MeasurementScreenProps {
  /** Injected in tests. The app uses its own virtual glasses when this is omitted. */
  readonly glasses?: SimulatedGlasses;
  /** Injected in tests. Defaults to performance.now, the same clock the recorder uses. */
  readonly clock?: () => number;
  readonly onClose?: () => void;
}

export function MeasurementScreen({
  glasses: injected,
  clock = nowMs,
  onClose,
}: MeasurementScreenProps) {
  const [fallback] = useState<SimulatedGlasses>(() => createVirtualGlasses());
  const glasses = injected ?? fallback;

  const recorderRef = useRef<CaptureToPhoneRecorder | null>(null);
  const [form, setForm] = useState<ProvenanceForm>(EMPTY_PROVENANCE);
  const [language, setLanguage] = useState<Language>("en");
  const [connected, setConnected] = useState(glasses.status === "connected");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [records, setRecords] = useState<readonly MeasurementRecord[]>([]);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<string | null>(null);
  const [exportLines, setExportLines] = useState<readonly string[]>([]);

  const update = (patch: Partial<ProvenanceForm>): void => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const connect = async (): Promise<void> => {
    setConnectError(null);
    try {
      await glasses.connect();
      setConnected(true);
    } catch {
      setConnectError(STRINGS.connectFailed);
    }
  };

  const disconnect = async (): Promise<void> => {
    if (sessionActive) {
      return;
    }
    await glasses.disconnect();
    setConnected(false);
  };

  const startSession = (): void => {
    setMessage(null);
    if (!connected) {
      setMessage(TEXT.startNeedsConnection);
      return;
    }
    const found = provenanceProblems(form);
    setProblems(found);
    if (found.length > 0) {
      return;
    }
    const recorder = new CaptureToPhoneRecorder(glasses, clock, toRecorderContext(form));
    recorder.beginLanguage(language);
    recorder.start();
    recorderRef.current = recorder;
    setRecords([]);
    setCsvText(null);
    setExportSummary(null);
    setExportLines([]);
    setSessionActive(true);
  };

  const endSession = (): void => {
    recorderRef.current?.stop();
    setSessionActive(false);
    setRecords([...(recorderRef.current?.tries ?? [])]);
  };

  const chooseLanguage = (next: Language): void => {
    setLanguage(next);
    recorderRef.current?.beginLanguage(next);
  };

  const sendTap = (): void => {
    setMessage(null);
    const recorder = recorderRef.current;
    if (!sessionActive || recorder === null) {
      setMessage(TEXT.tapNeedsSession);
      return;
    }
    try {
      glasses.pressButton(CAPTURE_TRIGGER_ACTION);
    } catch {
      setMessage(TEXT.tapFailed);
      return;
    }
    setRecords([...recorder.tries]);
  };

  const exportTries = (): void => {
    setMessage(null);
    const recorder = recorderRef.current;
    if (recorder === null || recorder.tries.length === 0) {
      setMessage(TEXT.exportNeedsTries);
      setCsvText(null);
      return;
    }
    const csv = recorder.exportCsv();
    const result = importMeasurementCsv(csv);
    setCsvText(csv);
    setExportSummary(TEXT.exportSummary(result.accepted.length, result.rejected.length));
    setExportLines([
      ...result.fileErrors,
      ...result.rejected
        .slice(0, 5)
        .map((row) => `Line ${String(row.line)}: ${row.reasons.join("; ")}`),
      ...summarizeEvidence(result.accepted).map(
        (summary) =>
          `${summary.evidenceLevel}, ${summary.timingSource}, ${summary.measure}, ${languageLabel(summary.report.language)}: ${String(summary.report.attempts)} tries, ${String(summary.report.measured)} measured, ${String(summary.report.passes)} within budget`,
      ),
    ]);
  };

  const tallies = tallyTries(records);
  const formEditable = !sessionActive;

  return (
    <ScrollView contentContainerStyle={styles.page} accessibilityLabel={TEXT.title}>
      <Text accessibilityRole="header" style={styles.heading}>
        {TEXT.title}
      </Text>
      <Text style={styles.body}>{TEXT.intro}</Text>

      <Section title={TEXT.linkSection}>
        <View accessibilityLiveRegion="polite">
          <Text style={styles.body}>{connected ? STRINGS.statusConnected : TEXT.notConnected}</Text>
        </View>
        {connectError === null ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {connectError}
          </Text>
        )}
        <ActionButton
          label={connected ? TEXT.disconnectVirtual : TEXT.connectVirtual}
          disabled={sessionActive}
          onPress={() => {
            void (connected ? disconnect() : connect());
          }}
        />
      </Section>

      <Section title={TEXT.languageSection}>
        <ChoiceGroup
          label={TEXT.languageGroup}
          choices={LANGUAGE_CHOICES}
          value={language}
          onChange={chooseLanguage}
        />
      </Section>

      <Section title={TEXT.provenanceSection}>
        <Field
          label={TEXT.runId}
          hint={TEXT.runIdHint}
          value={form.runId}
          editable={formEditable}
          onChangeText={(value) => update({ runId: value })}
        />
        <ChoiceGroup<ImportableEvidenceLevel>
          label={TEXT.evidenceGroup}
          choices={EVIDENCE_CHOICES}
          value={form.evidenceLevel}
          disabled={!formEditable}
          onChange={(value) => update({ evidenceLevel: value })}
        />
        <ChoiceGroup<RunByRole>
          label={TEXT.runByGroup}
          choices={RUN_BY_CHOICES}
          value={form.runByRole}
          disabled={!formEditable}
          onChange={(value) => update({ runByRole: value })}
        />
        <Field
          label={TEXT.deviceModel}
          value={form.deviceModel}
          editable={formEditable}
          onChangeText={(value) => update({ deviceModel: value })}
        />
        <Field
          label={TEXT.osVersion}
          value={form.osVersion}
          editable={formEditable}
          onChangeText={(value) => update({ osVersion: value })}
        />
        <Field
          label={TEXT.appBuild}
          value={form.appBuild}
          editable={formEditable}
          onChangeText={(value) => update({ appBuild: value })}
        />
        <Field
          label={TEXT.appCommit}
          value={form.appCommit}
          editable={formEditable}
          onChangeText={(value) => update({ appCommit: value })}
        />
        <Field
          label={TEXT.easBuildId}
          value={form.easBuildId}
          editable={formEditable}
          onChangeText={(value) => update({ easBuildId: value })}
        />
        <ChoiceGroup<NetworkType>
          label={TEXT.networkGroup}
          choices={NETWORK_CHOICES}
          value={form.networkType}
          disabled={!formEditable}
          onChange={(value) => update({ networkType: value })}
        />
        <Field
          label={TEXT.provider}
          value={form.provider}
          editable={formEditable}
          onChangeText={(value) => update({ provider: value })}
        />
        <Field
          label={TEXT.sampleSet}
          value={form.sampleSet}
          editable={formEditable}
          onChangeText={(value) => update({ sampleSet: value })}
        />
        <Field
          label={TEXT.batteryStartPct}
          value={form.batteryStartPct}
          editable={formEditable}
          keyboardType="number-pad"
          onChangeText={(value) => update({ batteryStartPct: value })}
        />
      </Section>

      <Section title={TEXT.sessionSection}>
        {problems.length === 0 ? null : (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.error}>{TEXT.problemsTitle}</Text>
            {problems.map((problem) => (
              <Text key={problem} style={styles.error}>
                {`• ${problem}`}
              </Text>
            ))}
          </View>
        )}
        <View accessibilityLiveRegion="polite">
          <Text style={styles.body}>
            {sessionActive
              ? `${TEXT.sessionRunning}: ${languageLabel(language)}`
              : TEXT.sessionIdle}
          </Text>
        </View>
        {message === null ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
        )}
        <Text style={styles.body}>{TEXT.newSessionClears}</Text>
        <ActionButton label={TEXT.startSession} disabled={sessionActive} onPress={startSession} />
        <ActionButton label={TEXT.sendTap} disabled={!sessionActive} onPress={sendTap} />
        <ActionButton label={TEXT.endSession} disabled={!sessionActive} onPress={endSession} />
      </Section>

      <Section title={TEXT.tallySection}>
        {records.length === 0 ? (
          <Text style={styles.body}>{TEXT.noTries}</Text>
        ) : (
          tallies
            .filter((tally) => tally.tries > 0)
            .map((tally) => (
              <Text key={tally.language} style={styles.body}>
                {TEXT.tallyLine(
                  languageLabel(tally.language),
                  tally.tries,
                  tally.completed,
                  tally.failed,
                )}
              </Text>
            ))
        )}
      </Section>

      <Section title={TEXT.measuresSection}>
        {MEASURE_ENTRIES.map((entry) => (
          <View
            key={entry.measure}
            accessible
            accessibilityLabel={`${entry.label}. ${entry.status === "instrumented" ? TEXT.instrumented : TEXT.notInstrumented}. ${TEXT.targetLabel}: ${entry.target}. ${entry.note}`}
            style={styles.measure}
          >
            <Text style={styles.bodyStrong}>{entry.label}</Text>
            <Text style={entry.status === "instrumented" ? styles.body : styles.notInstrumented}>
              {entry.status === "instrumented" ? TEXT.instrumented : TEXT.notInstrumented}
            </Text>
            <Text style={styles.body}>{`${TEXT.targetLabel}: ${entry.target}`}</Text>
            <Text style={styles.body}>{entry.note}</Text>
          </View>
        ))}
      </Section>

      <Section title={TEXT.exportSection}>
        <ActionButton label={TEXT.exportButton} onPress={exportTries} />
        {exportSummary === null ? null : <Text style={styles.body}>{exportSummary}</Text>}
        {exportLines.length === 0 ? null : (
          <View accessibilityLabel={TEXT.exportRejected}>
            {exportLines.map((line) => (
              <Text key={line} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        )}
        {csvText === null ? null : (
          <>
            <Text style={styles.body}>{TEXT.exportNote}</Text>
            <TextInput
              accessibilityLabel={TEXT.exportTextLabel}
              value={csvText}
              editable={false}
              multiline
              style={[styles.input, styles.csv]}
            />
          </>
        )}
      </Section>

      {onClose === undefined ? null : <ActionButton label={TEXT.close} onPress={onClose} />}
    </ScrollView>
  );
}

function nowMs(): number {
  return performance.now();
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  hint,
  value,
  editable,
  onChangeText,
  keyboardType,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly editable: boolean;
  readonly onChangeText: (value: string) => void;
  readonly keyboardType?: TextInputProps["keyboardType"];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
  disabled = false,
}: {
  readonly label: string;
  readonly choices: readonly { readonly value: T; readonly label: string }[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      <Text style={styles.body}>{label}</Text>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityLabel={choice.label}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => {
              onChange(choice.value);
            }}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Text style={selected ? styles.choiceTextSelected : styles.body}>{choice.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  heading: { fontSize: 26, fontWeight: "600", color: "#0B1B3F" },
  body: { fontSize: 16, color: "#0B1B3F", lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: "600", color: "#0B1B3F" },
  notInstrumented: { fontSize: 16, color: "#8a1c1c", fontWeight: "600" },
  error: { fontSize: 16, color: "#8a1c1c", lineHeight: 22 },
  errorBox: { gap: 4, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#8a1c1c" },
  section: { gap: 12, paddingTop: 8 },
  sectionTitle: { fontSize: 20, fontWeight: "600", color: "#0B1B3F" },
  field: { gap: 4 },
  group: { gap: 8 },
  measure: { gap: 4, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#9aa5b1" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#C9D6EE",
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    color: "#0B1B3F",
    backgroundColor: "#ffffff",
  },
  csv: { minHeight: 160, fontFamily: "monospace", textAlignVertical: "top" },
  choice: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C9D6EE",
    backgroundColor: "#ffffff",
  },
  choiceSelected: { backgroundColor: "#1E6BFF", borderColor: "#1E6BFF" },
  choiceTextSelected: { fontSize: 16, color: "#ffffff", fontWeight: "600" },
  button: {
    minHeight: 48,
    padding: 12,
    borderRadius: 999,
    backgroundColor: "#1E6BFF",
    justifyContent: "center",
  },
  buttonDisabled: { backgroundColor: "#9DB8F0" },
  buttonText: { color: "#ffffff", textAlign: "center", fontSize: 16, fontWeight: "600" },
});
