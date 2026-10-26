import { hudRows, nextDue, type HudInput } from "./hud-model";

const BASE: HudInput = {
  cameraLive: false,
  micAvailable: true,
  memoryCount: 0,
  automations: [],
  aiReady: false,
  day: "2026-10-26",
  clock: "09:00",
};

function row(input: HudInput, key: string) {
  const found = hudRows(input).find((r) => r.key === key);
  if (found === undefined) {
    throw new Error(`no row ${key}`);
  }
  return found;
}

describe("hudRows", () => {
  it("shows the camera as off on the home screen, and says where it runs", () => {
    const camera = row(BASE, "camera");
    expect(camera.tone).toBe("off");
    expect(camera.value).toMatch(/^Off/);
    expect(row({ ...BASE, cameraLive: true }, "camera")).toMatchObject({ tone: "on" });
  });

  it("warns when the browser has no speech recognition", () => {
    expect(row({ ...BASE, micAvailable: false }, "microphone")).toMatchObject({ tone: "warn" });
    expect(row(BASE, "microphone").value).toMatch(/^Off/);
  });

  it("uses the singular for one memory item", () => {
    expect(row({ ...BASE, memoryCount: 1 }, "memory").value).toMatch(/^1 saved item /);
    expect(row({ ...BASE, memoryCount: 3 }, "memory").value).toMatch(/^3 saved items /);
  });

  it("reports routines as none, next due, or done for today", () => {
    expect(row(BASE, "automations").value).toBe("None set");
    const routines = [{ enabled: true, time: "18:30" }];
    expect(row({ ...BASE, automations: routines }, "automations").value).toBe(
      "1 on · next at 18:30",
    );
    const finished = [{ enabled: true, time: "08:00", lastRunDay: "2026-10-26" }];
    expect(row({ ...BASE, clock: "09:00", automations: finished }, "automations").value).toBe(
      "1 on · nothing left to run today",
    );
  });

  it("asks for setup until the AI is configured, enrolled and accepted", () => {
    expect(row(BASE, "brain")).toMatchObject({ tone: "warn", value: "Setup needed" });
    expect(row({ ...BASE, aiReady: true }, "brain").tone).toBe("ready");
  });
});

describe("nextDue", () => {
  it("skips disabled routines and those that already ran today", () => {
    const list = [
      { enabled: false, time: "09:30" },
      { enabled: true, time: "09:45", lastRunDay: "2026-10-26" },
      { enabled: true, time: "11:00" },
      { enabled: true, time: "10:15" },
    ];
    expect(nextDue(list, "2026-10-26", "09:00")).toEqual({ enabled: true, time: "10:15" });
  });

  it("returns null when nothing is left today", () => {
    expect(nextDue([{ enabled: true, time: "06:00" }], "2026-10-26", "09:00")).toBeNull();
  });
});
