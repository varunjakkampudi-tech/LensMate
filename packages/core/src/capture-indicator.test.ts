import { CaptureIndicator } from "./capture-indicator.js";

describe("CaptureIndicator", () => {
  it("is off when no capture session is active", () => {
    expect(new CaptureIndicator().isOn).toBe(false);
  });

  it("is on while any capture session is active and off after the last one ends", () => {
    const indicator = new CaptureIndicator();
    indicator.startSession("PUSH_TO_TALK");
    indicator.startSession("TRANSLATION");
    expect(indicator.isOn).toBe(true);
    indicator.endSession("PUSH_TO_TALK");
    expect(indicator.isOn).toBe(true);
    indicator.endSession("TRANSLATION");
    expect(indicator.isOn).toBe(false);
  });

  it("refuses to turn the indicator off during capture", () => {
    const indicator = new CaptureIndicator();
    indicator.startSession("PHOTO_QUESTION");
    expect(indicator.requestOff()).toEqual({ ok: false, reason: "CAPTURE_ACTIVE" });
    expect(indicator.isOn).toBe(true);
  });

  it("allows turning the indicator off when no capture session is active", () => {
    const indicator = new CaptureIndicator();
    expect(indicator.requestOff()).toEqual({ ok: true });
  });

  it("ignores ending a session that never started", () => {
    const indicator = new CaptureIndicator();
    indicator.endSession("CAPTION");
    expect(indicator.isOn).toBe(false);
  });
});
