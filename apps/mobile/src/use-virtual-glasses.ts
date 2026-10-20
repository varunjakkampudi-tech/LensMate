import { useCallback, useMemo, useState } from "react";
import type { LinkStatus } from "@lensmate/core";
import { STRINGS } from "./strings";
import { createVirtualGlasses } from "./virtual-glasses-link";

export interface VirtualGlassesState {
  status: LinkStatus;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useVirtualGlasses(): VirtualGlassesState {
  const glasses = useMemo(() => createVirtualGlasses(), []);
  const [status, setStatus] = useState<LinkStatus>(glasses.status);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      await glasses.connect();
      setError(null);
    } catch {
      setError(STRINGS.connectFailed);
    }
    setStatus(glasses.status);
  }, [glasses]);

  const disconnect = useCallback(async () => {
    await glasses.disconnect();
    setStatus(glasses.status);
  }, [glasses]);

  return { status, error, connect, disconnect };
}
