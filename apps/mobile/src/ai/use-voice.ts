import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { aiErrorText, askText, type Turn } from "./assistant";
import { canListen, listen, listenErrorText, stopSpeaking, type Listening } from "./speech";
import { useCapture } from "../ui/capture-session";
import type { Lang } from "../ui/prefs";

/**
 * Push-to-talk microphone session: the mic runs only between start and the end of the utterance, Stop, or leaving the
 * screen. Each session ends only its own indicator (token), so a newer session's indicator is never cleared.
 */
export function useMicSession(label: string) {
  const capture = useCapture();
  const current = useRef<Listening | null>(null);
  const token = useRef(0);
  const [listening, setListening] = useState<Lang | null>(null);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const halt = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setListening(null);
  }, []);

  const stop = useCallback(() => {
    halt();
    capture.end(token.current);
  }, [capture, halt]);

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useFocusEffect(useCallback(() => () => stopRef.current(), []));

  const start = useCallback(
    (
      lang: Lang,
      onFinal: (text: string) => void,
      options: { detect?: boolean; onDetected?: (lang: Lang) => void } = {},
    ) => {
      setError(null);
      setPartial("");
      stopSpeaking();
      if (!canListen()) {
        setError(listenErrorText("UNSUPPORTED"));
        return;
      }
      setListening(lang);
      const mine = capture.begin("microphone", label, halt);
      token.current = mine;
      current.current = listen(lang, {
        detect: options.detect,
        onDetected: options.onDetected,
        onPartial: setPartial,
        onFinal,
        onError: (code) => setError(listenErrorText(code)),
        onEnd: () => {
          if (token.current === mine) {
            current.current = null;
            setListening(null);
          }
          capture.end(mine);
        },
      });
    },
    [capture, label, halt],
  );

  return { listening, partial, error, start, stop, available: canListen() };
}

/** Short rolling conversation (last 6 turns are sent, to keep cost low). Hidden turns steer the model but are not shown. */
export function useConversation(lang: Lang, extraSystem = "") {
  const [turns, setTurns] = useState<(Turn & { hidden?: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string, hidden = false): Promise<string | null> => {
      const history = [...turns, { role: "user" as const, content: text, hidden }];
      setTurns(history);
      setBusy(true);
      setError(null);
      try {
        const answer = await askText(
          history.map(({ role, content }) => ({ role, content })),
          lang,
          extraSystem,
        );
        setTurns([...history, { role: "assistant", content: answer.text }]);
        return answer.text;
      } catch (e) {
        setError(aiErrorText(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [turns, lang, extraSystem],
  );

  return {
    turns: turns.filter((t) => t.hidden !== true),
    busy,
    error,
    send,
    reset: () => setTurns([]),
  };
}
