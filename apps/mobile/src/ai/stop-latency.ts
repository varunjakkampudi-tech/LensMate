const measurements: number[] = [];
let stopRequestedAt: number | null = null;

export function markStop(now: number): void {
  stopRequestedAt = now;
}

export function markStopped(now: number): number | null {
  if (stopRequestedAt === null) {
    return null;
  }
  const latency = now - stopRequestedAt;
  stopRequestedAt = null;
  measurements.push(latency);
  if (measurements.length > 20) {
    measurements.shift();
  }
  return latency;
}

export function lastLatencyMs(): number | null {
  return measurements.at(-1) ?? null;
}
