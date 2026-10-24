import { useCallback, useEffect, useState } from "react";
import { acceptCloudDisclosure, isCloudDisclosureAccepted } from "../broker-access";
import { APPROVED_CLOUD_DISCLOSURE_VERSION, fetchBrokerUsage } from "../broker-call";
import { readBrokerConfig } from "../broker-config";
import { loadDeviceCredential, secureStorage } from "../device-credential";

const USAGE_TIMEOUT_MS = 15_000;

export interface AiSetup {
  readonly loading: boolean;
  readonly configured: boolean;
  readonly enrolled: boolean;
  readonly accepted: boolean;
  readonly ready: boolean;
  readonly spentPaise: number | null;
  readonly capPaise: number | null;
  accept(): Promise<void>;
  refresh(): void;
}

/** What the AI features still need on this phone: address, enrolment and the accepted cloud notice. */
export function useAiSetup(): AiSetup {
  const [state, setState] = useState({
    loading: true,
    configured: false,
    enrolled: false,
    accepted: false,
    spentPaise: null as number | null,
    capPaise: null as number | null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const configured = readBrokerConfig().ok;
      let enrolled = false;
      try {
        enrolled = (await loadDeviceCredential(secureStorage)).status === "enrolled";
      } catch {
        enrolled = false;
      }
      const accepted = await isCloudDisclosureAccepted(
        APPROVED_CLOUD_DISCLOSURE_VERSION,
        secureStorage,
      );
      let spentPaise: number | null = null;
      let capPaise: number | null = null;
      if (configured && enrolled && accepted) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), USAGE_TIMEOUT_MS);
        try {
          const usage = await fetchBrokerUsage(controller.signal);
          spentPaise = usage.spentPaise + usage.reservedPaise;
          capPaise = usage.capPaise;
        } catch {
          // Usage is display only; the broker still enforces the cap.
        } finally {
          clearTimeout(timer);
        }
      }
      if (alive) {
        setState({ loading: false, configured, enrolled, accepted, spentPaise, capPaise });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const accept = useCallback(async () => {
    if (APPROVED_CLOUD_DISCLOSURE_VERSION !== null) {
      await acceptCloudDisclosure(APPROVED_CLOUD_DISCLOSURE_VERSION, secureStorage);
    }
    setTick((t) => t + 1);
  }, []);

  return { ...state, ready: state.configured && state.enrolled && state.accepted, accept, refresh };
}

export function rupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
