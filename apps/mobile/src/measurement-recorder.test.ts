import { importMeasurementCsv, type LinkStatus } from "@lensmate/core";
import type { EnvelopeMessage } from "@lensmate/protocol";
import {
  CAPTURE_TRIGGER_ACTION,
  CaptureToPhoneRecorder,
  type RecorderContext,
  type TimedGlasses,
} from "./measurement-recorder";

const CONTEXT: RecorderContext = {
  runId: "unit-run-1",
  evidenceLevel: "simulator",
  runByRole: "agent",
  deviceModel: "unit test link",
  osVersion: "not applicable",
  appBuild: "unit",
  appCommit: "unit",
  easBuildId: "",
  networkType: "simulated",
  provider: "none",
  sampleSet: "scripted button presses",
  batteryStartPct: "",
};

class FakeGlasses implements TimedGlasses {
  status: LinkStatus = "connected";
  lastButtonAtMs: number | undefined = undefined;
  private readonly handlers = new Set<(message: EnvelopeMessage) => void>();

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  send(): Promise<void> {
    return Promise.resolve();
  }

  subscribe(handler: (message: EnvelopeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** The glasses emit a button event at `atMs`. The phone's handlers run synchronously, as in the simulator. */
  emitButton(action: string, atMs: number): void {
    this.lastButtonAtMs = atMs;
    this.dispatch(action);
  }

  /** A button event that reaches the phone with no timestamp from the glasses. */
  emitWithoutTimestamp(action: string): void {
    this.lastButtonAtMs = undefined;
    this.dispatch(action);
  }

  private dispatch(action: string): void {
    const message = {
      protocolVersion: 1,
      sequence: 1,
      button: { action, pressMs: 0 },
    } as unknown as EnvelopeMessage;
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  get subscriberCount(): number {
    return this.handlers.size;
  }
}

function recorderWith(clockValues: readonly number[]): {
  glasses: FakeGlasses;
  recorder: CaptureToPhoneRecorder;
} {
  const glasses = new FakeGlasses();
  let index = 0;
  const clock = (): number => {
    const value = clockValues[index];
    index += 1;
    return value ?? 0;
  };
  const recorder = new CaptureToPhoneRecorder(
    glasses,
    clock,
    CONTEXT,
    () => "2026-10-24T10:00:00Z",
  );
  return { glasses, recorder };
}

describe("CaptureToPhoneRecorder", () => {
  it("records a completed try from the glasses timestamp and the phone clock", () => {
    const { glasses, recorder } = recorderWith([250]);
    recorder.start();
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 100);

    const [record] = recorder.tries;
    expect(record?.outcome).toBe("completed");
    expect(record?.measure).toBe("capture_to_phone");
    expect(record?.marks).toEqual({ capture: 100, phone_received: 250 });
    expect(record?.measurementId).toBe("unit-run-1-en-cap-001");
  });

  it("ignores button events that are not the capture trigger", () => {
    const { glasses, recorder } = recorderWith([250]);
    recorder.start();
    glasses.emitButton("BUTTON_ACTION_RELEASE", 100);
    expect(recorder.tries).toHaveLength(0);
  });

  it("records a failed try, not an estimate, when the glasses timestamp is missing", () => {
    const { glasses, recorder } = recorderWith([250]);
    recorder.start();
    glasses.emitWithoutTimestamp(CAPTURE_TRIGGER_ACTION);

    const [record] = recorder.tries;
    expect(record?.outcome).toBe("failed");
    expect(record?.marks).toEqual({});
    expect(record?.notes).toBe("no glasses timestamp for this button event");
  });

  it("treats a non-finite glasses timestamp as missing", () => {
    const { glasses, recorder } = recorderWith([250]);
    recorder.start();
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, Number.NaN);

    expect(recorder.tries[0]?.outcome).toBe("failed");
    expect(recorder.tries[0]?.marks).toEqual({});
  });

  it("records a failed try when the phone clock is earlier than the glasses timestamp", () => {
    const { glasses, recorder } = recorderWith([50]);
    recorder.start();
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 100);

    const [record] = recorder.tries;
    expect(record?.outcome).toBe("failed");
    expect(record?.notes).toMatch(/earlier than the glasses timestamp/);
  });

  it("numbers trials separately for each language", () => {
    const { glasses, recorder } = recorderWith([10, 20, 30]);
    recorder.start();
    recorder.beginLanguage("en");
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 5);
    recorder.beginLanguage("te");
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 15);

    expect(recorder.tries.map((record) => record.measurementId)).toEqual([
      "unit-run-1-en-cap-001",
      "unit-run-1-te-cap-001",
    ]);
  });

  it("does not record twice when started twice, and stops listening when stopped", () => {
    const { glasses, recorder } = recorderWith([10, 20]);
    recorder.start();
    recorder.start();
    expect(glasses.subscriberCount).toBe(1);

    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 5);
    recorder.stop();
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 15);
    expect(recorder.tries).toHaveLength(1);
    expect(glasses.subscriberCount).toBe(0);
  });

  it("exports tries that pass the measurement import validator", () => {
    const { glasses, recorder } = recorderWith([10, 20, 130]);
    recorder.start();
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 5);
    glasses.emitButton(CAPTURE_TRIGGER_ACTION, 15);
    glasses.emitWithoutTimestamp(CAPTURE_TRIGGER_ACTION);

    const result = importMeasurementCsv(recorder.exportCsv());
    expect(result.fileErrors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted.map((record) => record.outcome)).toEqual([
      "completed",
      "completed",
      "failed",
    ]);
  });
});
