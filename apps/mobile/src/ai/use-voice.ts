import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
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
