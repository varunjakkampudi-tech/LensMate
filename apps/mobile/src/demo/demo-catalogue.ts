/**
 * The demo's synthetic scenes and prerecorded sample questions. Everything here is made up for the demo:
 * no photograph, no real person, no real recording. Titles and copy live in demo-strings.ts.
 */
export type SceneId = "STREET_SIGN" | "MEDICINE_LABEL" | "MENU";

export type QuestionId =
  "SIGN_SAYS" | "SIGN_DIRECTION" | "DOSE_FREQUENCY" | "DOSE_LIMIT" | "CHEAPEST_ITEM" | "SOUP_PRICE";

/** One drawn element of a scene. Positions and sizes are percentages of the frame, so it scales. */
export interface SceneShape {
  readonly kind: "panel" | "text";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly tone: "blue" | "white" | "grey" | "ink";
  /** Text printed on the drawing (kind "text", or a panel with a label). Part of the synthetic picture. */
  readonly text?: string;
  readonly align?: "center" | "left";
}

export interface DemoScene {
  readonly id: SceneId;
  readonly shapes: readonly SceneShape[];
  /** The sample questions for this scene. The first one is the sample used by push-to-talk. */
  readonly questionIds: readonly QuestionId[];
}

export interface DemoQuestion {
  readonly id: QuestionId;
  readonly sceneId: SceneId;
}

export const SCENES: readonly DemoScene[] = [
  {
    id: "STREET_SIGN",
    shapes: [
      { kind: "panel", x: 48, y: 28, w: 4, h: 32, tone: "grey" },
      { kind: "panel", x: 22, y: 6, w: 56, h: 22, tone: "blue", text: "ONE WAY", align: "center" },
      { kind: "panel", x: 30, y: 52, w: 40, h: 6, tone: "ink" },
    ],
    questionIds: ["SIGN_SAYS", "SIGN_DIRECTION"],
  },
  {
    id: "MEDICINE_LABEL",
    shapes: [
      { kind: "panel", x: 12, y: 6, w: 76, h: 50, tone: "white" },
      {
        kind: "text",
        x: 17,
        y: 12,
        w: 66,
        h: 8,
        tone: "ink",
        text: "Take 1 tablet twice a day with food.",
        align: "left",
      },
      {
        kind: "text",
        x: 17,
        y: 26,
        w: 66,
        h: 8,
        tone: "ink",
        text: "Maximum 4 tablets in 24 hours.",
        align: "left",
      },
      {
        kind: "text",
        x: 17,
        y: 40,
        w: 66,
        h: 8,
        tone: "grey",
        text: "Synthetic label for a demo.",
        align: "left",
      },
    ],
    questionIds: ["DOSE_FREQUENCY", "DOSE_LIMIT"],
  },
  {
    id: "MENU",
    shapes: [
      { kind: "panel", x: 20, y: 4, w: 60, h: 54, tone: "white" },
      {
        kind: "text",
        x: 26,
        y: 12,
        w: 48,
        h: 8,
        tone: "ink",
        text: "Soup of the day   40",
        align: "left",
      },
      {
        kind: "text",
        x: 26,
        y: 28,
        w: 48,
        h: 8,
        tone: "ink",
        text: "Veg roll   60",
        align: "left",
      },
      { kind: "text", x: 26, y: 44, w: 48, h: 8, tone: "ink", text: "Tea   20", align: "left" },
    ],
    questionIds: ["CHEAPEST_ITEM", "SOUP_PRICE"],
  },
];

export const QUESTIONS: readonly DemoQuestion[] = [
  { id: "SIGN_SAYS", sceneId: "STREET_SIGN" },
  { id: "SIGN_DIRECTION", sceneId: "STREET_SIGN" },
  { id: "DOSE_FREQUENCY", sceneId: "MEDICINE_LABEL" },
  { id: "DOSE_LIMIT", sceneId: "MEDICINE_LABEL" },
  { id: "CHEAPEST_ITEM", sceneId: "MENU" },
  { id: "SOUP_PRICE", sceneId: "MENU" },
];

export function sceneById(id: SceneId): DemoScene {
  const scene = SCENES.find((candidate) => candidate.id === id);
  if (scene === undefined) {
    throw new RangeError(`unknown demo scene: ${id}`);
  }
  return scene;
}

export function questionById(id: QuestionId): DemoQuestion {
  const question = QUESTIONS.find((candidate) => candidate.id === id);
  if (question === undefined) {
    throw new RangeError(`unknown demo question: ${id}`);
  }
  return question;
}

/** The sample used when the user holds the button to ask. */
export function defaultQuestionOf(id: SceneId): QuestionId {
  const first = sceneById(id).questionIds[0];
  if (first === undefined) {
    throw new RangeError(`demo scene ${id} has no sample questions`);
  }
  return first;
}
