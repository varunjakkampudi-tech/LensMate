import { useEffect, useReducer } from "react";
import type { Gesture } from "@lensmate/core";
import type { PhraseId, QuestionId, SceneId } from "./demo-catalogue";
import {
  DEMO_TIMING,
  answerThroughGateway,
  cannedAnswer,
  initialDemoState,
  mockAnswerRun,
  reduceDemo,
  type DemoScenario,
  type DemoState,
} from "./demo-model";

export interface DemoSession {
  readonly state: DemoState;
  chooseScenario(scenario: DemoScenario): void;
  chooseScene(sceneId: SceneId): void;
  takePhoto(): void;
  holdStart(): void;
  holdEnd(): void;
  askQuestion(questionId: QuestionId): void;
  stop(): void;
  retry(): void;
  back(): void;
  readText(): void;
  startTranslation(): void;
  speakPhrase(phraseId: PhraseId): void;
  stopTranslation(): void;
}

/**
 * Runs the demo: a pure reducer for the state, timers for the simulated photo capture and the answer's
 * pace, and one gateway call per accepted question. Nothing here opens a network connection.
 */
export function useDemoSession(initial: DemoScenario = "NORMAL"): DemoSession {
  const [state, dispatch] = useReducer(reduceDemo, initial, initialDemoState);

  // One gateway call per accepted request. A reset or a newer request makes the old result stale.
  useEffect(() => {
    const request = state.pending;
    if (request === null) {
      return undefined;
    }
    let live = true;
    const answer = cannedAnswer(request.sceneId, request.questionId);
    void answerThroughGateway(request, mockAnswerRun(answer, request.scenario)).then((outcome) => {
      if (live) {
        dispatch({ type: "ANSWER", requestId: request.requestId, outcome });
      }
    });
    return () => {
      live = false;
    };
  }, [state.pending]);

  const animating = state.phase === "STREAMING" || state.phase === "PLAYING";
  useEffect(() => {
    if (!animating) {
      return undefined;
    }
    const id = setInterval(() => {
      dispatch({ type: "TICK" });
    }, DEMO_TIMING.wordMs);
    return () => {
      clearInterval(id);
    };
  }, [animating]);

  const photoCapturing = state.photoCapture;
  useEffect(() => {
    if (!photoCapturing) {
      return undefined;
    }
    const id = setTimeout(() => {
      dispatch({ type: "PHOTO_DONE" });
    }, DEMO_TIMING.photoCaptureMs);
    return () => {
      clearTimeout(id);
    };
  }, [photoCapturing]);

  // The translation countdown advances only while a translation session runs (simulated time, see DEMO_TIMING).
  const translating = state.glasses.mode === "TRANSLATION";
  useEffect(() => {
    if (!translating) {
      return undefined;
    }
    const id = setInterval(() => {
      dispatch({ type: "TRANSLATION_TICK" });
    }, DEMO_TIMING.translationTickMs);
    return () => {
      clearInterval(id);
    };
  }, [translating]);

  const gesture = (next: Gesture): void => {
    dispatch({ type: "GESTURE", gesture: next });
  };

  return {
    state,
    chooseScenario: (scenario) => {
      dispatch({ type: "SCENARIO", scenario });
    },
    chooseScene: (sceneId) => {
      dispatch({ type: "SCENE", sceneId });
    },
    takePhoto: () => {
      gesture("SINGLE_TAP");
    },
    holdStart: () => {
      gesture("HOLD");
    },
    holdEnd: () => {
      gesture("RELEASE");
    },
    askQuestion: (questionId) => {
      dispatch({ type: "ASK", questionId });
    },
    stop: () => {
      gesture("PRESS");
    },
    retry: () => {
      dispatch({ type: "RETRY" });
    },
    back: () => {
      dispatch({ type: "BACK" });
    },
    readText: () => {
      dispatch({ type: "READ_TEXT" });
    },
    startTranslation: () => {
      dispatch({ type: "TRANSLATION_START" });
    },
    speakPhrase: (phraseId) => {
      dispatch({ type: "TRANSLATION_PHRASE", phraseId });
    },
    stopTranslation: () => {
      dispatch({ type: "TRANSLATION_STOP" });
    },
  };
}
