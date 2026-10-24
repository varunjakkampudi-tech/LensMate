import { fireEvent, render, screen } from "@testing-library/react-native";
import { DemoScreen } from "./demo-screen";
import { DEMO } from "./demo-strings";

/** The whole journey runs at the demo's simulated pace, so allow for a slow machine. */
jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };

/**
 * One full run of the demo, as a user would do it: choose a scene, take a photo, ask a question, read the
 * mock answer, interrupt it, and read the event log summary. Synthetic input and a mock provider only.
 */
describe("demo journey", () => {
  it("runs scene, photo, question, answer, interrupt, and shows the event log summary", async () => {
    const fetchSpy = jest.fn();
    const realFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    const onBack = jest.fn();
    try {
      await render(<DemoScreen onBack={onBack} />);

      // 1. See: a synthetic scene.
      await fireEvent.press(screen.getByRole("button", { name: DEMO.scenes.MENU.title }));
      expect(screen.getByText(DEMO.sceneLabel)).toBeTruthy();

      // 2. Take a photo with one tap. The indicator says the camera is on, then it turns off.
      await fireEvent.press(screen.getByRole("button", { name: DEMO.photo }));
      expect(screen.getByText(DEMO.indicatorPhoto)).toBeTruthy();
      expect(await screen.findByText(DEMO.indicatorOff, {}, WAIT)).toBeTruthy();
      expect(screen.getByText(DEMO.photoTaken(1))).toBeTruthy();

      // 3. Hear: a prerecorded synthetic question, shown with its synthetic transcript.
      await fireEvent.press(screen.getByRole("button", { name: DEMO.questions.CHEAPEST_ITEM }));
      expect(screen.getByText(DEMO.transcriptLabel)).toBeTruthy();

      // 4. Talk: the mock label, then the answer starts. Stop is offered while speech runs.
      expect(await screen.findByText(DEMO.mockLabel, {}, WAIT)).toBeTruthy();
      expect(screen.getByTestId("answer")).toBeTruthy();
      const stop = await screen.findByRole("button", { name: DEMO.stop }, WAIT);

      // 5. Interrupt: Stop ends the speech at once, and the stop time is shown as simulated.
      await fireEvent.press(stop);
      expect(await screen.findByText(DEMO.statusStopped, {}, WAIT)).toBeTruthy();
      expect(screen.getByText(/Stopped at \d+ ms on the simulated timeline/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: DEMO.stop })).toBeNull();

      // 6. The event log summary: one photo, one question, one answer, one stop, no errors.
      expect(
        screen.getByText(
          DEMO.logLine({
            photos: 1,
            questions: 1,
            answers: 1,
            stops: 1,
            errors: 0,
            ocr: 0,
            translationStarts: 0,
            translationStops: 0,
          }),
        ),
      ).toBeTruthy();

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });
});
