import { IDLE_STATE } from "@lensmate/core";
import { defaultQuestionOf, type QuestionId, type SceneId } from "./demo-catalogue";
import {
  ANSWER_COST_MINOR,
  DEMO_CAP_MINOR,
  DEMO_TIMING,
  answerThroughGateway,
  budgetFor,
  budgetFraction,
  cannedAnswer,
  indicatorState,
  indicatorText,
  initialDemoState,
  isBusy,
  mockAnswerRun,
  reduceDemo,
  summarizeLog,
  toDemoError,
  visibleAnswer,
  wordCount,
  type AnswerOutcome,
  type DemoAction,
  type DemoRequest,
  type DemoScenario,
  type DemoState,
} from "./demo-model";
import { DEMO, DEMO_MOCK_LABEL } from "./demo-strings";

function run(state: DemoState, ...actions: DemoAction[]): DemoState {
  return actions.reduce(reduceDemo, state);
}

function withScene(sceneId: SceneId = "STREET_SIGN", scenario: DemoScenario = "NORMAL"): DemoState {
  return run(initialDemoState(scenario), { type: "SCENE", sceneId });
}

/** Asks a question on a fresh scene and returns the state with the request in flight. */
function asked(
  sceneId: SceneId,
  questionId: QuestionId,
  scenario: DemoScenario = "NORMAL",
): DemoState {
  return run(withScene(sceneId, scenario), { type: "ASK", questionId });
}

function okOutcome(sceneId: SceneId, questionId: QuestionId): AnswerOutcome {
  return { ok: true, answer: cannedAnswer(sceneId, questionId), costMinor: ANSWER_COST_MINOR };
}

/** A streaming answer for the street sign, with the request accepted and the mock answer returned. */
function streaming(): DemoState {
  const inFlight = asked("STREET_SIGN", "SIGN_SAYS");
  return run(inFlight, {
    type: "ANSWER",
    requestId: inFlight.requestId,
    outcome: okOutcome("STREET_SIGN", "SIGN_SAYS"),
  });
}

function ticks(state: DemoState, count: number): DemoState {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = reduceDemo(next, { type: "TICK" });
  }
  return next;
}

describe("demo model: canned answers and the mock provider", () => {
  it("labels every canned answer as a mock, never as AI output", () => {
    const pairs: [SceneId, QuestionId][] = [
      ["STREET_SIGN", "SIGN_SAYS"],
      ["STREET_SIGN", "SIGN_DIRECTION"],
      ["MEDICINE_LABEL", "DOSE_FREQUENCY"],
      ["MEDICINE_LABEL", "DOSE_LIMIT"],
      ["MENU", "CHEAPEST_ITEM"],
      ["MENU", "SOUP_PRICE"],
    ];
    for (const [sceneId, questionId] of pairs) {
      const answer = cannedAnswer(sceneId, questionId);
      expect(answer.label).toBe(DEMO_MOCK_LABEL);
      expect(answer.text).toBe(DEMO.answers[questionId]);
    }
  });

  it("refuses a question that does not belong to the scene", () => {
    expect(() => cannedAnswer("MENU", "SIGN_SAYS")).toThrow(RangeError);
  });

  it("returns the canned answer from the mock provider after the simulated processing delay", async () => {
    const answer = cannedAnswer("STREET_SIGN", "SIGN_SAYS");
    const result = await mockAnswerRun(answer, "NORMAL")(new AbortController().signal);
    expect(result).toEqual({ value: answer, costMinor: ANSWER_COST_MINOR });
    expect(result.value.label).toBe(DEMO_MOCK_LABEL);
  });

  it("makes the mock provider reject when the scenario says it is unavailable", async () => {
    const answer = cannedAnswer("MENU", "SOUP_PRICE");
    await expect(
      mockAnswerRun(answer, "PROVIDER_UNAVAILABLE")(new AbortController().signal),
    ).rejects.toThrow("unavailable");
  });

  it("makes the mock provider stall until the caller aborts it", async () => {
    const answer = cannedAnswer("MENU", "SOUP_PRICE");
    const controller = new AbortController();
    const pending = mockAnswerRun(answer, "PROVIDER_TIMEOUT")(controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("aborted");
  });
});

describe("demo model: gateway path (core ProviderGateway)", () => {
  function counting(inner: ReturnType<typeof mockAnswerRun>): {
    readonly run: typeof inner;
    readonly calls: () => number;
  } {
    let calls = 0;
    return {
      run: (signal) => {
        calls += 1;
        return inner(signal);
      },
      calls: () => calls,
    };
  }

  function request(scenario: DemoScenario, spentMinor = 0): DemoRequest {
    return {
      requestId: 1,
      sceneId: "MENU",
      questionId: "CHEAPEST_ITEM",
      scenario,
      budget: { capMinor: DEMO_CAP_MINOR, spentMinor },
    };
  }

  it("refuses the call with CAP_REACHED through the gateway, without calling the provider", async () => {
    const answer = cannedAnswer("MENU", "CHEAPEST_ITEM");
    const probe = counting(mockAnswerRun(answer, "NORMAL"));
    const outcome = await answerThroughGateway(request("SPEND_CAP", DEMO_CAP_MINOR), probe.run);
    expect(outcome).toEqual({ ok: false, error: "CAP_REACHED" });
    expect(probe.calls()).toBe(0);
  });

  it("returns the canned answer and the cost through the gateway when the cap has room", async () => {
    const answer = cannedAnswer("MENU", "CHEAPEST_ITEM");
    const probe = counting(mockAnswerRun(answer, "NORMAL"));
    const outcome = await answerThroughGateway(request("NORMAL"), probe.run);
    expect(outcome).toEqual({ ok: true, answer, costMinor: ANSWER_COST_MINOR });
    expect(probe.calls()).toBe(1);
  });

  it("reports an unavailable provider as UNAVAILABLE after one attempt", async () => {
    const answer = cannedAnswer("MENU", "CHEAPEST_ITEM");
    const probe = counting(mockAnswerRun(answer, "PROVIDER_UNAVAILABLE"));
    const outcome = await answerThroughGateway(request("PROVIDER_UNAVAILABLE"), probe.run);
    expect(outcome).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(probe.calls()).toBe(1);
  });

  it("reports a stalled provider as TIMEOUT when the gateway's timeout passes", async () => {
    const answer = cannedAnswer("MENU", "CHEAPEST_ITEM");
    const outcome = await answerThroughGateway(
      request("PROVIDER_TIMEOUT"),
      mockAnswerRun(answer, "PROVIDER_TIMEOUT"),
    );
    expect(outcome).toEqual({ ok: false, error: "TIMEOUT" });
  });

  it("maps gateway error codes onto the demo's messages", () => {
    expect(toDemoError("TIMEOUT")).toBe("TIMEOUT");
    expect(toDemoError("CAP_REACHED")).toBe("CAP_REACHED");
    expect(toDemoError("PROVIDER_ERROR")).toBe("UNAVAILABLE");
    expect(toDemoError("CIRCUIT_OPEN")).toBe("UNAVAILABLE");
  });

  it("gives each scenario its starting budget", () => {
    expect(budgetFor("NORMAL")).toEqual({ capMinor: DEMO_CAP_MINOR, spentMinor: 0 });
    expect(budgetFor("SPEND_CAP")).toEqual({
      capMinor: DEMO_CAP_MINOR,
      spentMinor: DEMO_CAP_MINOR,
    });
    expect(budgetFraction({ capMinor: 100, spentMinor: 25 })).toBe(0.25);
    expect(budgetFraction({ capMinor: 100, spentMinor: 500 })).toBe(1);
  });
});

describe("demo model: photo, hold and the indicator", () => {
  it("takes a photo with the camera indicator on until the simulated capture ends", () => {
    const shot = run(withScene(), { type: "GESTURE", gesture: "SINGLE_TAP" });
    expect(shot.photoCapture).toBe(true);
    expect(shot.photos).toBe(1);
    expect(indicatorState(shot)).toEqual({ camera: true, microphone: false });
    expect(indicatorText(shot)).toBe(DEMO.indicatorPhoto);

    const done = run(shot, { type: "PHOTO_DONE" });
    expect(indicatorState(done)).toEqual({ camera: false, microphone: false });
    expect(indicatorText(done)).toBe(DEMO.indicatorOff);
  });

  it("does not take a second photo while one is being taken, or before a scene is chosen", () => {
    const empty = initialDemoState();
    expect(reduceDemo(empty, { type: "GESTURE", gesture: "SINGLE_TAP" })).toBe(empty);

    const shot = run(withScene(), { type: "GESTURE", gesture: "SINGLE_TAP" });
    expect(reduceDemo(shot, { type: "GESTURE", gesture: "SINGLE_TAP" })).toBe(shot);
    expect(shot.photos).toBe(1);
  });

  it("holds push-to-talk with the microphone indicator on, and sends the scene sample on release", () => {
    const holding = run(withScene("MENU"), { type: "GESTURE", gesture: "HOLD" });
    expect(holding.glasses.mode).toBe("PUSH_TO_TALK");
    expect(indicatorState(holding)).toEqual({ camera: false, microphone: true });
    expect(indicatorText(holding)).toBe(DEMO.indicatorHold);

    const sent = run(holding, { type: "GESTURE", gesture: "RELEASE" });
    expect(sent.glasses).toEqual(IDLE_STATE);
    expect(sent.questionId).toBe(defaultQuestionOf("MENU"));
    expect(sent.phase).toBe("PROCESSING");
    expect(sent.pending).not.toBeNull();
    expect(indicatorText(sent)).toBe(DEMO.indicatorOff);
    expect(sent.log).toEqual(["SCENE", "HOLD", "RELEASE", "QUESTION"]);
  });

  it("ignores a photo tap while the button is held, as core's gesture rules do", () => {
    const holding = run(withScene(), { type: "GESTURE", gesture: "HOLD" });
    const tapped = reduceDemo(holding, { type: "GESTURE", gesture: "SINGLE_TAP" });
    expect(tapped.photos).toBe(0);
    expect(tapped.photoCapture).toBe(false);
  });

  it("does not hold the button before a scene is chosen", () => {
    const empty = initialDemoState();
    expect(reduceDemo(empty, { type: "GESTURE", gesture: "HOLD" })).toBe(empty);
  });
});

describe("demo model: answer, streaming, playback and interrupt", () => {
  it("moves from processing to streaming when the canned answer arrives, and starts speech on the glasses", () => {
    const inFlight = asked("STREET_SIGN", "SIGN_SAYS");
    expect(inFlight.phase).toBe("PROCESSING");
    expect(isBusy(inFlight)).toBe(true);

    const ready = run(inFlight, {
      type: "ANSWER",
      requestId: inFlight.requestId,
      outcome: okOutcome("STREET_SIGN", "SIGN_SAYS"),
    });
    expect(ready.phase).toBe("STREAMING");
    expect(ready.glasses.speaking).toBe(true);
    expect(ready.budget.spentMinor).toBe(ANSWER_COST_MINOR);
    expect(visibleAnswer(ready)).toBe("");
  });

  it("shows the answer one word per simulated tick, then plays back, then finishes", () => {
    const answer = cannedAnswer("STREET_SIGN", "SIGN_SAYS");
    const words = wordCount(answer);
    const first = ticks(streaming(), 1);
    expect(visibleAnswer(first)).toBe(answer.text.split(" ")[0]);

    const playing = ticks(streaming(), words);
    expect(playing.phase).toBe("PLAYING");
    expect(visibleAnswer(playing)).toBe(answer.text);

    const done = ticks(streaming(), words + DEMO_TIMING.playbackTicks);
    expect(done.phase).toBe("DONE");
    expect(done.glasses.speaking).toBe(false);
    expect(done.log.at(-1)).toBe("DONE");
  });

  it("stops speech on a press at once, and records the stop on the simulated timeline", () => {
    const interrupted = run(ticks(streaming(), 3), { type: "GESTURE", gesture: "PRESS" });
    expect(interrupted.phase).toBe("STOPPED");
    expect(interrupted.glasses.speaking).toBe(false);
    expect(interrupted.stopSimulatedMs).toBe(3 * DEMO_TIMING.wordMs);
    expect(visibleAnswer(interrupted).split(" ")).toHaveLength(3);
    expect(interrupted.log.at(-1)).toBe("STOP");
  });

  it("does nothing on a press when no speech is running", () => {
    const idle = withScene();
    expect(reduceDemo(idle, { type: "GESTURE", gesture: "PRESS" })).toBe(idle);
  });

  it("ignores an answer for a request that was replaced, and one for a state that is not processing", () => {
    const inFlight = asked("STREET_SIGN", "SIGN_SAYS");
    const stale = run(inFlight, {
      type: "ANSWER",
      requestId: inFlight.requestId - 1,
      outcome: okOutcome("STREET_SIGN", "SIGN_SAYS"),
    });
    expect(stale).toBe(inFlight);

    const idle = withScene();
    expect(
      reduceDemo(idle, {
        type: "ANSWER",
        requestId: idle.requestId,
        outcome: okOutcome("STREET_SIGN", "SIGN_SAYS"),
      }),
    ).toBe(idle);
  });

  it("refuses a question from another scene, and a second question while one is busy", () => {
    const scene = withScene("STREET_SIGN");
    expect(reduceDemo(scene, { type: "ASK", questionId: "SOUP_PRICE" })).toBe(scene);

    const inFlight = asked("STREET_SIGN", "SIGN_SAYS");
    expect(reduceDemo(inFlight, { type: "ASK", questionId: "SIGN_DIRECTION" })).toBe(inFlight);
  });

  it("does not change the scene or the scenario while an answer runs", () => {
    const inFlight = asked("STREET_SIGN", "SIGN_SAYS");
    expect(reduceDemo(inFlight, { type: "SCENE", sceneId: "MENU" })).toBe(inFlight);
    expect(reduceDemo(inFlight, { type: "SCENARIO", scenario: "OFFLINE" })).toBe(inFlight);
  });
});

describe("demo model: errors and recovery", () => {
  it("shows a gateway error with its code and retries the same question", () => {
    const inFlight = asked("STREET_SIGN", "SIGN_SAYS", "PROVIDER_UNAVAILABLE");
    const failed = run(inFlight, {
      type: "ANSWER",
      requestId: inFlight.requestId,
      outcome: { ok: false, error: "UNAVAILABLE" },
    });
    expect(failed.phase).toBe("ERROR");
    expect(failed.error).toBe("UNAVAILABLE");
    expect(failed.log.at(-1)).toBe("ERROR");

    const retried = reduceDemo(failed, { type: "RETRY" });
    expect(retried.phase).toBe("PROCESSING");
    expect(retried.questionId).toBe("SIGN_SAYS");
    expect(retried.requestId).toBe(failed.requestId + 1);
  });

  it("does not offer a retry after the spend cap refusal, and backs out to the questions", () => {
    const inFlight = asked("STREET_SIGN", "SIGN_SAYS", "SPEND_CAP");
    const refused = run(inFlight, {
      type: "ANSWER",
      requestId: inFlight.requestId,
      outcome: { ok: false, error: "CAP_REACHED" },
    });
    expect(refused.error).toBe("CAP_REACHED");
    expect(reduceDemo(refused, { type: "RETRY" })).toBe(refused);

    const back = reduceDemo(refused, { type: "BACK" });
    expect(back.phase).toBe("IDLE");
    expect(back.error).toBeNull();
    expect(back.questionId).toBeNull();
    expect(back.sceneId).toBe("STREET_SIGN");
  });

  it("reports offline at once, without a pending request, so the gateway is never called", () => {
    const offline = asked("MENU", "SOUP_PRICE", "OFFLINE");
    expect(offline.phase).toBe("ERROR");
    expect(offline.error).toBe("OFFLINE");
    expect(offline.pending).toBeNull();
    expect(offline.log).toEqual(["SCENE", "QUESTION", "ERROR"]);
  });

  it("retries an offline request, which fails again while the scenario is still offline", () => {
    const offline = asked("MENU", "SOUP_PRICE", "OFFLINE");
    const again = reduceDemo(offline, { type: "RETRY" });
    expect(again.error).toBe("OFFLINE");
    expect(again.phase).toBe("ERROR");
  });

  it("clears the answer and the error when the scenario changes, and sets the budget for it", () => {
    const failed = run(asked("MENU", "SOUP_PRICE", "OFFLINE"), {
      type: "SCENARIO",
      scenario: "SPEND_CAP",
    });
    expect(failed.error).toBeNull();
    expect(failed.phase).toBe("IDLE");
    expect(failed.budget.spentMinor).toBe(DEMO_CAP_MINOR);
    expect(failed.log.at(-1)).toBe("SCENARIO");
  });

  it("returns the state unchanged for retry or back when there is no error", () => {
    const idle = withScene();
    expect(reduceDemo(idle, { type: "RETRY" })).toBe(idle);
    expect(reduceDemo(idle, { type: "BACK" })).toBe(idle);
  });
});

describe("demo model: summaries and indicator text", () => {
  it("counts the event log by kind, and labels what it keeps", () => {
    expect(summarizeLog(["PHOTO", "QUESTION", "ANSWER", "STOP", "ERROR", "ERROR"])).toEqual({
      photos: 1,
      questions: 1,
      answers: 1,
      stops: 1,
      errors: 2,
    });
    expect(DEMO.logLine(1, 1, 1, 1, 0)).toContain("Recorded as kinds only");
  });

  it("shows the indicator as words, and says the camera and microphone are off when idle", () => {
    expect(indicatorText(withScene())).toBe(DEMO.indicatorOff);
    expect(indicatorState(withScene())).toEqual({ camera: false, microphone: false });
  });
});
