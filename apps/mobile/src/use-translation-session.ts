import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { GlassesLink, LinkStatus } from "@lensmate/core";
import { PROTOCOL_VERSION, type EnvelopeMessage } from "@lensmate/protocol";
import type { SimulatorEvent } from "@lensmate/simulator";
import {
  INITIAL_TRANSLATION_MODEL,
  ackErrorText,
  reduceTranslation,
  type ListeningKind,
  type TranslationSessionModel,
} from "./translation-session-model";
import { STRINGS } from "./strings";

const T = STRINGS.translationSession;

/**
 * The link the translation screen needs: the envelope link, the simulator's event feed, and the
 * silence check. On hardware the silence check runs on the glasses; the simulator needs it called.
 */
export type TranslationSessionLink = GlassesLink & {
  subscribeEvents(handler: (event: SimulatorEvent) => void): () => void;
  checkSilence(): void;
};

export interface TranslationSessionController {
  readonly model: TranslationSessionModel;
  readonly linkStatus: LinkStatus;
  readonly connecting: boolean;
  readonly pending: "START" | "STOP" | null;
  readonly error: string | null;
  readonly now: number;
  connect(): Promise<void>;
  start(session: ListeningKind): Promise<void>;
  stop(): Promise<void>;
}

/** The silence check runs once a second while a session runs. */
const SILENCE_TICK_MS = 1000;

function sessionEnvelope(
  sequence: number,
  session: ListeningKind,
  phase: "SESSION_PHASE_ACTIVE" | "SESSION_PHASE_ENDED",
): EnvelopeMessage {
  const type = session === "TRANSLATION" ? "SESSION_TYPE_TRANSLATION" : "SESSION_TYPE_CAPTION";
  return { protocolVersion: PROTOCOL_VERSION, sequence, session: { type, phase } };
}

/**
 * Drives the translation and caption session from the link. Starts and stops go to the glasses as session
 * messages. The indicator and session events come back from the glasses; the screen shows only those.
 */
export function useTranslationSession(
  link: TranslationSessionLink,
  clock: () => number,
  tickMs: number = SILENCE_TICK_MS,
): TranslationSessionController {
  const [model, dispatch] = useReducer(reduceTranslation, INITIAL_TRANSLATION_MODEL);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(link.status);
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState<"START" | "STOP" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => clock());
  // Sequences of requests still waiting for the glasses. An acknowledgement for one of them is an error.
  const awaiting = useRef(new Set<number>());
  const lastSequence = useRef(0);
  // A ref, not state, so a second press in the same frame cannot start a second request.
  const busy = useRef(false);

  useEffect(() => {
    const unsubscribeEnvelopes = link.subscribe((message) => {
      if (message.indicator !== undefined) {
        dispatch({
          type: "INDICATOR",
          on: message.indicator.on === true,
          reason: message.indicator.reason ?? "INDICATOR_REASON_IDLE",
        });
        return;
      }
      const ack = message.ack;
      if (ack?.ackedSequence !== undefined && awaiting.current.has(ack.ackedSequence)) {
        setError(ackErrorText(ack.error ?? ""));
      }
    });
    const unsubscribeEvents = link.subscribeEvents((event) => {
      dispatch({ type: "EVENT", event });
    });
    return () => {
      unsubscribeEnvelopes();
      unsubscribeEvents();
    };
  }, [link]);

  const listening = model.session !== null;
  useEffect(() => {
    if (!listening) {
      return undefined;
    }
    const id = setInterval(() => {
      link.checkSilence();
      setNow(clock());
    }, tickMs);
    return () => {
      clearInterval(id);
    };
  }, [link, clock, listening, tickMs]);

  const sendRequest = useCallback(
    async (build: (sequence: number) => EnvelopeMessage): Promise<void> => {
      lastSequence.current += 1;
      const sequence = lastSequence.current;
      awaiting.current.add(sequence);
      try {
        await link.send(build(sequence));
      } catch {
        setError(T.errors.notConnected);
      } finally {
        awaiting.current.delete(sequence);
      }
    },
    [link],
  );

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await link.connect();
    } catch {
      setError(T.errors.connectFailed);
    } finally {
      setConnecting(false);
      setLinkStatus(link.status);
    }
  }, [link]);

  const start = useCallback(
    async (session: ListeningKind) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setPending("START");
      setError(null);
      setNow(clock());
      try {
        await sendRequest((sequence) => sessionEnvelope(sequence, session, "SESSION_PHASE_ACTIVE"));
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [clock, sendRequest],
  );

  const stop = useCallback(async () => {
    if (busy.current || model.session === null) {
      return;
    }
    const session = model.session;
    busy.current = true;
    setPending("STOP");
    setError(null);
    try {
      await sendRequest((sequence) => sessionEnvelope(sequence, session, "SESSION_PHASE_ENDED"));
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, [model.session, sendRequest]);

  return { model, linkStatus, connecting, pending, error, now, connect, start, stop };
}
