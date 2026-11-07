import { lastLatencyMs, markStop, markStopped } from "./stop-latency";

describe("stop latency recorder", () => {
  it("has no measurement before a stop request", () => {
    expect(markStopped(120)).toBeNull();
    expect(lastLatencyMs()).toBeNull();
  });

  it("computes latency from the stop request to speech ending", () => {
    markStop(100);

    expect(markStopped(145)).toBe(45);
    expect(lastLatencyMs()).toBe(45);
  });

  it("keeps only the latest 20 measurements", () => {
    for (let index = 0; index < 21; index += 1) {
      markStop(index * 10);
      expect(markStopped(index * 10 + index)).toBe(index);
    }

    expect(lastLatencyMs()).toBe(20);
  });

  it("returns null for a second end without another stop request", () => {
    markStop(200);

    expect(markStopped(215)).toBe(15);
    expect(markStopped(230)).toBeNull();
    expect(lastLatencyMs()).toBe(15);
  });
});
