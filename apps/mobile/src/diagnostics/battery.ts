import type { BatteryReading } from "./checks";

/**
 * Reads the battery level where the browser reports it (Chrome on Android does; Safari on iPhone does not). Returns null
 * everywhere else, and the check then says the level is not reported.
 */
export async function readBattery(): Promise<BatteryReading | null> {
  const nav = globalThis.navigator as
    (Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }) | undefined;
  if (typeof nav?.getBattery !== "function") {
    return null;
  }
  try {
    const battery = await nav.getBattery();
    return { level: battery.level, charging: battery.charging };
  } catch {
    return null;
  }
}
