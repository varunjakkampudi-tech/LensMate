import { router } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { confirmAction, runAgentTask, type AgentStep } from "../src/ai/agent";
import { Bubble, WaveBars, type Message } from "../src/assistant/message-parts";
import { RequestCancelled } from "../src/ai/assistant";
import { RunGuard } from "../src/ai/run-guard";
import { aiErrorText } from "../src/ai/assistant";
import { listenForStop, speak, stopSpeaking } from "../src/ai/speech";
import { NothingToSummarise, summariseConversation } from "../src/ai/summary";
import { useMicSession } from "../src/ai/use-voice";
import { readBrokerConfig } from "../src/broker-config";
import { useCapture } from "../src/ui/capture-session";
import { Icon } from "../src/ui/icon";
import { Notice } from "../src/ui/kit";
import { LangPicker } from "../src/ui/lang-picker";
import { usePrefs, type Lang } from "../src/ui/prefs";
import { FONTS, useTheme } from "../src/ui/theme";

const SUGGESTIONS = ["What can you do?", "Summarise my notes", "Translate a sentence"];

/** Assistant: speak or type. The multi-agent assistant answers aloud and can research, remember and propose actions. */
export default function AssistantScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const [lang, setLang] = useState<Lang>(prefs.language);
  const mic = useMicSession("Voice question");
  const [typed, setTyped] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const guard = useRef(new RunGuard()).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const lastAnswer = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.failedQuestion === undefined);
  const brokerSet = readBrokerConfig().ok;
  const voiceOn = prefs.features.talk;

  const push = (m: Omit<Message, "id">) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { ...m, id }]);
  };

  const run = async (text: string) => {
    const question = text.trim();
    if (question === "" || busy) {
      return;
    }
    setError(null);
    push({ role: "user", text: question });
    setBusy(true);
    const current = guard.begin();
    const steps: AgentStep[] = [];
    // The answer appears as it streams, in one placeholder message. The final answer replaces its text, so it is
    // never shown twice. A cancelled request removes the placeholder.
    const placeholderId = nextId.current++;
    setMessages((prev) => [
      ...prev,
      { id: placeholderId, role: "assistant", text: "", steps: [], actions: [] },
    ]);
    const dropPlaceholder = () => setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
    try {
      const r = await runAgentTask(
        question,
        lang,
        (s) => {
          if (guard.isCurrent(current.id)) {
            steps.push(s);
          }
        },
        current.signal,
        prefs.tone,
        (partial) => {
          if (guard.isCurrent(current.id)) {
            setMessages((prev) =>
              prev.map((m) => (m.id === placeholderId ? { ...m, text: partial } : m)),
            );
          }
        },
      );
      // A late answer from a cancelled or replaced request is dropped: never shown, never spoken.
      if (!guard.isCurrent(current.id)) {
        dropPlaceholder();
        return;
      }
      guard.finish(current.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, text: r.answer, steps, actions: r.actions, source: r.source }
            : m,
        ),
      );
      setSpeaking(true);
      speak(r.answer, lang, prefs.voiceRate, () => setSpeaking(false));
    } catch (e) {
      if (e instanceof RequestCancelled || !guard.isCurrent(current.id)) {
        dropPlaceholder();
        return;
      }
      guard.finish(current.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId ? { ...m, text: aiErrorText(e), failedQuestion: question } : m,
        ),
      );
    } finally {
      if (guard.isLatest(current.id)) {
        setBusy(false);
      }
    }
  };

  /** Stop: cancels the request in flight, the speech and the microphone. Nothing from a stopped request is added later. */
  const stopAll = () => {
    const cancelled = guard.cancel();
    mic.stop();
    stopSpeaking();
    setSpeaking(false);
    setBusy(false);
    if (cancelled) {
      push({ role: "assistant", text: "Stopped. No answer was added to this conversation." });
    }
  };

  /**
   * Summary of this conversation on request (F8). Only the user's lines and the answers are sent: placeholders, failed
   * requests and the Stop notice have no source and are left out. Stop cancels it like any other request.
   */
  const summarise = async () => {
    if (busy) {
      return;
    }
    const lines = messages
      .filter((m) => m.role === "user" || m.source !== undefined)
      .map((m) => ({ role: m.role, text: m.text }));
    if (lines.length === 0) {
      setError("Nothing to summarise yet.");
      return;
    }
    setError(null);
    push({ role: "user", text: "Summarise this conversation" });
    setBusy(true);
    const current = guard.begin();
    try {
      const a = await summariseConversation(lines, lang, current.signal);
      if (!guard.isCurrent(current.id)) {
        return;
      }
      guard.finish(current.id);
      push({ role: "assistant", text: a.text, source: a.source });
    } catch (e) {
      if (e instanceof RequestCancelled || !guard.isCurrent(current.id)) {
        return;
      }
      guard.finish(current.id);
      setError(e instanceof NothingToSummarise ? e.message : aiErrorText(e));
    } finally {
      if (guard.isLatest(current.id)) {
        setBusy(false);
      }
    }
  };

  // F26: while an answer is read aloud, a spoken stop word ends it. The listener runs only inside a capture session,
  // so the microphone indicator shows, and the shell's Stop control ends it. It waits while a question is being
  // listened to or answered, because the browser allows one recogniser at a time.
  const capture = useCapture();
  const stopRef = useRef(stopAll);
  stopRef.current = stopAll;
  const listeningNow = mic.listening !== null;
  useEffect(() => {
    if (!speaking || !voiceOn || busy || listeningNow) {
      return;
    }
    const watch = listenForStop(lang, () => {
      stopRef.current();
    });
    const token = capture.begin("microphone", "Stop by voice", () => {
      watch.stop();
      stopSpeaking();
      setSpeaking(false);
    });
    return () => {
      watch.stop();
      capture.end(token);
    };
  }, [speaking, voiceOn, busy, listeningNow, lang, capture]);

  // Leaving the screen cancels any request and stops speech and the microphone. The ref holds the latest microphone
  // session, which is rebuilt on each render, so the cleanup stops the current one.
  const micRef = useRef(mic);
  micRef.current = mic;
  useEffect(
    () => () => {
      guard.cancel();
      micRef.current.stop();
      stopSpeaking();
    },
    // The guard lives for the screen's lifetime, so this runs once, on unmount.
    [guard],
  );

  const listening = mic.listening !== null;
  const status = listening
    ? "Microphone on · speak now, tap the red button to stop"
    : busy
      ? "Thinking…"
      : speaking
        ? "Speaking…"
        : mic.available
          ? "Ready · microphone off"
          : "Microphone not available in this browser · type your question";
  const statusColor = listening ? c.danger : busy ? c.accent2 : speaking ? c.accent : c.muted;
  const providerLabel =
    lastAnswer?.source === "openrouter"
      ? "LIVE"
      : lastAnswer?.source === "mock"
        ? "MOCK"
        : brokerSet
          ? "NOT CHECKED"
          : "MOCK";
  const providerTone = providerLabel === "LIVE" ? c.ok : c.accent2;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: 10,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: c.surface2,
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityElementsHidden
        >
          <Icon name="glasses" color={c.accent} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            accessibilityRole="header"
            style={{ color: c.text, fontFamily: FONTS.display, fontSize: 20, fontWeight: "800" }}
          >
            Assistant
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
            <Text
              testID="talk-status"
              accessibilityLiveRegion="polite"
              style={{
                color: statusColor,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {status}
            </Text>
            <WaveBars active={listening || speaking} color={statusColor} />
          </View>
        </View>
        <View
          testID="provider-badge"
          accessibilityLabel={`Answers: ${providerLabel === "LIVE" ? "live provider" : "mock, no provider called"}`}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: providerTone,
          }}
        >
          <Text
            style={{ color: providerTone, fontFamily: FONTS.body, fontSize: 11, fontWeight: "800" }}
          >
            {providerLabel}
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
        <LangPicker prefix="talk-lang" value={lang} onChange={setLang} />
      </View>

      {!voiceOn ? (
        <View style={{ paddingHorizontal: 18 }}>
          <Notice tone="warn">Voice questions are switched off in Profile → Features.</Notice>
        </View>
      ) : null}
      {error === null ? null : (
        <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <Notice testID="talk-error" tone="error">
            {error}
          </Notice>
        </View>
      )}
      {mic.error === null ? null : (
        <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <Notice tone="error">{mic.error}</Notice>
        </View>
      )}

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 8, gap: 12, flexGrow: 1 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", gap: 14, paddingVertical: 24 }}>
            <Text
              style={{
                color: c.text,
                fontFamily: FONTS.display,
                fontSize: 18,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              Ask anything, by voice or text.
            </Text>
            <Text
              style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: "center" }}
            >
              {brokerSet
                ? "Answers come from the AI service once this phone is enrolled."
                : "No AI address is set in this build, so answers are mock responses."}
            </Text>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}
            >
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask: ${s}`}
                  disabled={!voiceOn || busy}
                  onPress={() => void run(s)}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                    borderRadius: 999,
                    backgroundColor: c.surface,
                    borderWidth: 1,
                    borderColor: c.border,
                    opacity: !voiceOn || busy ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 13 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open translate"
                onPress={() => router.push("/translate")}
                style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: "center" }}
              >
                <Text
                  style={{
                    color: c.accent,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Translate
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open See to take a photo"
                onPress={() => router.push("/capture")}
                style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: "center" }}
              >
                <Text
                  style={{
                    color: c.accent,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  See a photo
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {messages.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            isLast={lastAnswer?.id === m.id}
            onReplay={() => {
              setSpeaking(true);
              speak(m.text, lang, prefs.voiceRate, () => setSpeaking(false));
            }}
            onRetry={() => m.failedQuestion !== undefined && void run(m.failedQuestion)}
            onConfirm={(a) => void confirmAction(a)}
          />
        ))}
        {busy ? (
          <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 13, paddingLeft: 4 }}>
            Thinking…
          </Text>
        ) : null}
      </ScrollView>

      {messages.length > 0 && !busy ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 4, alignItems: "flex-start" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Summarise this conversation"
            testID="talk-summarise-button"
            disabled={!voiceOn}
            onPress={() => void summarise()}
            style={{ minHeight: 48, justifyContent: "center", opacity: voiceOn ? 1 : 0.5 }}
          >
            <Text
              style={{ color: c.accent, fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}
            >
              Summarise this conversation
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 10,
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: Platform.OS === "ios" ? 24 : 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.surface,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            !mic.available
              ? "Microphone not available in this browser"
              : listening
                ? "Stop listening, microphone on"
                : "Start listening, microphone off"
          }
          accessibilityState={{ disabled: busy || !voiceOn || !mic.available, selected: listening }}
          testID="talk-mic-button"
          disabled={busy || !voiceOn || !mic.available}
          onPress={() => (listening ? mic.stop() : mic.start(lang, (t) => void run(t)))}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: listening ? c.danger : c.surface2,
            opacity: busy || !voiceOn || !mic.available ? 0.5 : 1,
          }}
        >
          <Icon name="mic" color={listening ? "#fff" : c.accent} size={22} />
        </Pressable>
        <TextInput
          testID="talk-typed-input"
          accessibilityLabel="Your question"
          value={typed}
          onChangeText={setTyped}
          placeholder="Ask a question or give a task"
          placeholderTextColor={c.muted}
          editable={voiceOn}
          multiline
          style={{
            flex: 1,
            minHeight: 48,
            maxHeight: 120,
            color: c.text,
            fontFamily: FONTS.body,
            fontSize: 15,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 24,
            backgroundColor: c.surface2,
          }}
        />
        {!busy && !speaking && !listening && lastAnswer !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Repeat the last answer"
            testID="talk-repeat-button"
            onPress={() => {
              setSpeaking(true);
              speak(lastAnswer.text, lang, prefs.voiceRate, () => setSpeaking(false));
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.surface2,
            }}
          >
            <Icon name="speaker" color={c.text} size={20} />
          </Pressable>
        ) : null}
        {busy || speaking || listening ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop"
            testID="talk-interrupt-button"
            onPress={stopAll}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.danger,
            }}
          >
            <Icon name="stop" color="#fff" size={20} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send question"
            testID="talk-send-button"
            disabled={typed.trim() === "" || !voiceOn}
            onPress={() => {
              const t = typed.trim();
              setTyped("");
              void run(t);
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.accent,
              opacity: typed.trim() === "" || !voiceOn ? 0.45 : 1,
            }}
          >
            <Icon name="send" color={c.accentInk} size={20} />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
