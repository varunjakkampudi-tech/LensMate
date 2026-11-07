import { VoiceQuestion, VoiceQuestionError } from "./voice-question.js";
import type { QuestionAnalysis, QuestionCamera } from "./voice-question.js";
import type { PlatformCheck } from "./camera-capture.js";

const T0 = 1_000;
const FRAME = new Uint8Array([9, 8, 7]);
const yes: PlatformCheck = () => Promise.resolve(true);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets pending promise continuations run. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

type CameraResult = Awaited<ReturnType<QuestionCamera["capturePhoto"]>>;
type AnalysisResult = Awaited<ReturnType<QuestionAnalysis["analyze"]>>;

function fakeCamera(
  script: () => Promise<CameraResult> = () =>
    Promise.resolve({ status: "OK", frame: FRAME, capturedAtMs: T0 }),
) {
  const calls = { capture: 0, cancel: 0 };
  const camera: QuestionCamera = {
    capturePhoto: () => {
      calls.capture += 1;
      return script();
    },
    cancel: () => {
      calls.cancel += 1;
    },
  };
  return { camera, calls };
}

function fakeAnalysisFactory(
  script: () => Promise<AnalysisResult> = () =>
    Promise.resolve({ status: "OK", value: "A red mug", analyzedAtMs: T0 }),
) {
  const created: Array<{ analyze: number; cancel: number }> = [];
  const createAnalysis = (): QuestionAnalysis => {
    const record = { analyze: 0, cancel: 0 };
    created.push(record);
    return {
      analyze: () => {
        record.analyze += 1;
        return script();
      },
      cancel: () => {
        record.cancel += 1;
      },
    };
  };
  return { createAnalysis, created };
}

describe("voice-triggered visual question answering (C03)", () => {
  it("C03: a question needs a verified wearer utterance before any capture", async () => {
    for (const utterance of [
      () => Promise.resolve(false),
      () => Promise.resolve("yes"),
      () => Promise.reject(new Error("speech service down")),
    ]) {
      const cam = fakeCamera();
      const analysis = fakeAnalysisFactory();
      const vq = new VoiceQuestion({
        camera: cam.camera,
        createAnalysis: analysis.createAnalysis,
        utteranceVerified: utterance,
      });
      expect(await vq.ask("what is this?", T0)).toEqual({
        status: "REFUSED",
        reason: "NO_WEARER_INTENT",
      });
      expect(cam.calls.capture).toBe(0);
      expect(analysis.created).toHaveLength(0);
    }
  });

  it("C03: capture and analysis refusals are passed through, with no answer", async () => {
    const refusedCapture = fakeCamera(() =>
      Promise.resolve({ status: "REFUSED", reason: "NOT_PERMITTED" }),
    );
    const a = fakeAnalysisFactory();
    const vq1 = new VoiceQuestion({
      camera: refusedCapture.camera,
      createAnalysis: a.createAnalysis,
      utteranceVerified: yes,
    });
    expect(await vq1.ask("what is this?", T0)).toEqual({
      status: "REFUSED",
      reason: "NOT_PERMITTED",
    });
    expect(a.created).toHaveLength(0);

    const cam = fakeCamera();
    const refusedAnalysis = fakeAnalysisFactory(() =>
      Promise.resolve({ status: "REFUSED", reason: "DISCLOSURE_REQUIRED" }),
    );
    const vq2 = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: refusedAnalysis.createAnalysis,
      utteranceVerified: yes,
    });
    expect(await vq2.ask("what is this?", T0)).toEqual({
      status: "REFUSED",
      reason: "DISCLOSURE_REQUIRED",
    });
    expect(cam.calls.capture).toBe(1);
  });

  it("C03: invalid question or time is refused before any call", async () => {
    const cam = fakeCamera();
    const analysis = fakeAnalysisFactory();
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    });
    for (const bad of [42, "", "   ", "x".repeat(501)]) {
      expect(await vq.ask(bad as unknown as string, T0)).toEqual({
        status: "REFUSED",
        reason: "BAD_INPUT",
      });
    }
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(await vq.ask("what is this?", bad)).toEqual({
        status: "REFUSED",
        reason: "BAD_INPUT",
      });
    }
    expect(cam.calls.capture).toBe(0);
    expect(analysis.created).toHaveLength(0);
  });

  it("C03: concurrent questions are refused", async () => {
    const pending = deferred<CameraResult>();
    const cam = fakeCamera(() => pending.promise);
    const analysis = fakeAnalysisFactory();
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    });
    const first = vq.ask("what is this?", T0);
    await flush();
    expect(vq.asking).toBe(true);
    expect(await vq.ask("and this?", T0 + 1)).toEqual({ status: "REFUSED", reason: "BUSY" });
    expect(cam.calls.capture).toBe(1);
    pending.resolve({ status: "OK", frame: FRAME, capturedAtMs: T0 });
    expect((await first).status).toBe("OK");
  });

  it("C03: cancel during the utterance check stops the question with no capture", async () => {
    const utterance = deferred<unknown>();
    const cam = fakeCamera();
    const analysis = fakeAnalysisFactory();
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: () => utterance.promise,
    });
    const running = vq.ask("what is this?", T0);
    await flush();
    vq.cancel();
    utterance.resolve(true);
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    expect(cam.calls.capture).toBe(0);
    expect(analysis.created).toHaveLength(0);
  });

  it("C03: cancel after capture discards the answer", async () => {
    const analysisResult = deferred<AnalysisResult>();
    const cam = fakeCamera();
    const analysis = fakeAnalysisFactory(() => analysisResult.promise);
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    });
    const running = vq.ask("what is this?", T0);
    await flush();
    expect(analysis.created).toHaveLength(1);
    vq.cancel();
    expect(cam.calls.cancel).toBe(1);
    expect(analysis.created[0]?.cancel).toBe(1);
    analysisResult.resolve({ status: "OK", value: "late answer", analyzedAtMs: T0 });
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
  });

  it("C03: a question returns the answer and keeps no state afterwards", async () => {
    const cam = fakeCamera();
    const analysis = fakeAnalysisFactory();
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    });
    expect(await vq.ask("what is this?", T0)).toEqual({
      status: "OK",
      answer: "A red mug",
      askedAtMs: T0,
    });
    expect(vq.asking).toBe(false);
    for (const value of Object.values(vq)) {
      expect(value instanceof Uint8Array).toBe(false);
      expect(value).not.toBe("A red mug");
    }
  });

  it("C03: a failed stage leaves the coordinator usable", async () => {
    let failCapture = true;
    const cam = fakeCamera(() =>
      failCapture
        ? Promise.resolve({ status: "REFUSED", reason: "CAPTURE_FAILED" })
        : Promise.resolve({ status: "OK", frame: FRAME, capturedAtMs: T0 }),
    );
    const analysis = fakeAnalysisFactory();
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    });
    expect(await vq.ask("what is this?", T0)).toEqual({
      status: "REFUSED",
      reason: "CAPTURE_FAILED",
    });
    expect(vq.asking).toBe(false);
    failCapture = false;
    expect((await vq.ask("what is this?", T0 + 1)).status).toBe("OK");
  });

  it("C03: cancelling one question does not block the next", async () => {
    const pending = deferred<CameraResult>();
    let first = true;
    const cam = fakeCamera(() =>
      first ? pending.promise : Promise.resolve({ status: "OK", frame: FRAME, capturedAtMs: T0 }),
    );
    const analysis = fakeAnalysisFactory();
    const vq = new VoiceQuestion({
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    });
    const running = vq.ask("what is this?", T0);
    await flush();
    vq.cancel();
    pending.resolve({ status: "OK", frame: FRAME, capturedAtMs: T0 });
    expect(await running).toEqual({ status: "REFUSED", reason: "CANCELLED" });
    first = false;
    expect((await vq.ask("second question", T0 + 2)).status).toBe("OK");
  });

  it("C03: malformed dependencies are refused at construction", () => {
    const cam = fakeCamera();
    const analysis = fakeAnalysisFactory();
    const good = {
      camera: cam.camera,
      createAnalysis: analysis.createAnalysis,
      utteranceVerified: yes,
    };
    const bad: Array<Record<string, unknown>> = [
      { camera: undefined },
      { camera: {} },
      { createAnalysis: undefined },
      { createAnalysis: "analysis" },
      { utteranceVerified: "yes" },
    ];
    for (const override of bad) {
      expect(() => new VoiceQuestion({ ...good, ...override })).toThrow(VoiceQuestionError);
    }
  });
});
