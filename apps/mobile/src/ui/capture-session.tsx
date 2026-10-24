import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Capture sessions (v9 section 21, G5, G6): camera or microphone input exists only inside a session the user started.
 * While one runs, the shell shows the indicator and a one-tap Stop. Stopping always runs the session's own cleanup.
 */
export type CaptureKind = "camera" | "microphone";

interface ActiveSession {
  readonly kind: CaptureKind;
  readonly label: string;
}

interface CaptureApi {
  readonly active: ActiveSession | null;
  /** Starts a session and returns its token; only that token can end it. */
  begin(kind: CaptureKind, label: string, stop: () => void): number;
  end(token: number): void;
  stopAll(): void;
}

const Ctx = createContext<CaptureApi>({
  active: null,
  begin: () => 0,
  end: () => undefined,
  stopAll: () => undefined,
});

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveSession | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);

  const stopAll = useCallback(() => {
    const stop = stopRef.current;
    stopRef.current = null;
    tokenRef.current += 1;
    setActive(null);
    stop?.();
  }, []);

  const begin = useCallback(
    (kind: CaptureKind, label: string, stop: () => void) => {
      stopAll();
      tokenRef.current += 1;
      stopRef.current = stop;
      setActive({ kind, label });
      return tokenRef.current;
    },
    [stopAll],
  );

  const end = useCallback((token: number) => {
    if (token !== tokenRef.current || stopRef.current === null) {
      return;
    }
    stopRef.current = null;
    setActive(null);
  }, []);

  const value = useMemo(() => ({ active, begin, end, stopAll }), [active, begin, end, stopAll]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapture() {
  return useContext(Ctx);
}
