import {
  QUESTIONS,
  SCENES,
  defaultQuestionOf,
  questionById,
  sceneById,
  type SceneId,
} from "./demo-catalogue";
import { DEMO, DEMO_MOCK_LABEL } from "./demo-strings";

describe("demo catalogue", () => {
  it("has four synthetic scenes with unique ids and a title and description for each", () => {
    expect(SCENES.map((scene) => scene.id)).toEqual([
      "STREET_SIGN",
      "MEDICINE_LABEL",
      "MENU",
      "PLAIN_WALL",
    ]);
    for (const scene of SCENES) {
      expect(DEMO.scenes[scene.id].title.length).toBeGreaterThan(0);
      expect(DEMO.scenes[scene.id].description.length).toBeGreaterThan(0);
    }
  });

  it("gives every scene two sample questions, and every question belongs to exactly one scene", () => {
    for (const scene of SCENES) {
      expect(scene.questionIds).toHaveLength(2);
      for (const questionId of scene.questionIds) {
        expect(questionById(questionId).sceneId).toBe(scene.id);
      }
    }
    const listed = SCENES.flatMap((scene) => scene.questionIds);
    expect(new Set(listed).size).toBe(QUESTIONS.length);
    expect(listed.sort()).toEqual(QUESTIONS.map((question) => question.id).sort());
  });

  it("gives every sample question a spoken text and a canned answer", () => {
    for (const question of QUESTIONS) {
      expect(DEMO.questions[question.id]).toMatch(/\?$/);
      expect(DEMO.answers[question.id]).toMatch(/\S/);
    }
  });

  it("uses the first sample question of a scene for push-to-talk", () => {
    expect(defaultQuestionOf("STREET_SIGN")).toBe("SIGN_SAYS");
    expect(defaultQuestionOf("MEDICINE_LABEL")).toBe("DOSE_FREQUENCY");
    expect(defaultQuestionOf("MENU")).toBe("CHEAPEST_ITEM");
  });

  it("keeps every drawn shape inside the frame", () => {
    for (const scene of SCENES) {
      for (const shape of scene.shapes) {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.w).toBeLessThanOrEqual(100);
        expect(shape.y + shape.h).toBeLessThanOrEqual(100);
      }
    }
  });

  it("throws for an unknown scene or question instead of guessing", () => {
    expect(() => sceneById("NOPE" as SceneId)).toThrow(RangeError);
    expect(() => questionById("NOPE" as never)).toThrow(RangeError);
  });

  it("keeps the exact mock label required for every answer", () => {
    expect(DEMO_MOCK_LABEL).toBe("MOCK RESPONSE — canned demo answer, not AI output");
    expect(DEMO.mockLabel).toBe(DEMO_MOCK_LABEL);
  });
});
