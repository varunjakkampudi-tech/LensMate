import { fireEvent, render, screen } from "@testing-library/react-native";
import { TRANSLATION_START_ANNOUNCEMENT } from "@lensmate/core";
import HomeScreen from "../../app/index";
import { DemoScreen } from "./demo-screen";
import { DEMO } from "./demo-strings";
import type { DemoErrorCode, DemoScenario } from "./demo-model";

const mockPush = jest.fn();

// The home button navigates with the router; the router itself is not under test here.
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), navigate: jest.fn() },
}));

// The demo paces streaming, photo capture and playback with real timers. Fake timers make that pace virtual, so each
// wait below depends on the simulated pace and not on how loaded the machine is.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** A wait budget in virtual time, longer than the demo's simulated pace. */
const WAIT = { timeout: 4000 };

async function press(name: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name }));
}

async function choose(name: string): Promise<void> {
  await fireEvent.press(screen.getByRole("radio", { name }));
}

describe("demo screen: home button", () => {
  it("opens the demo from the home screen", async () => {
    mockPush.mockClear();
    await render(<HomeScreen />);
    await press(DEMO.openButton);
    expect(mockPush).toHaveBeenCalledWith("/demo");
  });
});

describe("demo screen: see, hear and talk", () => {
  let fetchSpy: jest.Mock;
  let realFetch: typeof fetch;

  beforeEach(() => {
    realFetch = global.fetch;
    fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("shows the synthetic transcript and the mock label after a scene and a question are chosen", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    expect(screen.getByText(DEMO.statusIdle)).toBeTruthy();

    await press(DEMO.scenes.STREET_SIGN.title);
    expect(screen.getByText(DEMO.sceneLabel)).toBeTruthy();
    await press(DEMO.questions.SIGN_SAYS);

    expect(screen.getByText(DEMO.transcriptLabel)).toBeTruthy();
    expect(screen.getByText(DEMO.transcriptNote)).toBeTruthy();
    expect(await screen.findByText(DEMO.mockLabel, {}, WAIT)).toBeTruthy();
  });

  it("streams the answer, then finishes playback as a simulated state", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.STREET_SIGN.title);
    await press(DEMO.questions.SIGN_SAYS);

    expect(await screen.findByText(DEMO.answers.SIGN_SAYS, {}, WAIT)).toBeTruthy();
    expect(await screen.findByText(DEMO.statusDone, {}, WAIT)).toBeTruthy();
    expect(screen.queryByRole("button", { name: DEMO.stop })).toBeNull();
  });

  it("interrupts the answer at once with Stop, and reports the stop time as simulated", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.MENU.title);
    await press(DEMO.questions.SOUP_PRICE);
    await screen.findByText(DEMO.mockLabel, {}, WAIT);

    await press(DEMO.stop);

    expect(await screen.findByText(DEMO.statusStopped, {}, WAIT)).toBeTruthy();
    expect(screen.getByText(/Stopped at \d+ ms on the simulated timeline/)).toBeTruthy();
    expect(screen.getAllByText(/SIMULATED, not measured/)).toHaveLength(2);
    expect(screen.queryByText(DEMO.answers.SOUP_PRICE)).toBeNull();
  });

  it("refuses to take a photo or ask before a scene is chosen", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    expect(screen.getByRole("button", { name: DEMO.photo })).toBeTruthy();
    expect(screen.getByRole("button", { name: DEMO.photo }).props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByText(DEMO.photoNeedsScene)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: DEMO.holdToAsk }).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("shows the photo indicator while the photo is taken, and the hold indicator while held", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    expect(screen.getByText(DEMO.indicatorOff)).toBeTruthy();
    await press(DEMO.scenes.MEDICINE_LABEL.title);

    await press(DEMO.photo);
    expect(screen.getByText(DEMO.indicatorPhoto)).toBeTruthy();
    expect(await screen.findByText(DEMO.indicatorOff, {}, WAIT)).toBeTruthy();

    const hold = screen.getByRole("button", { name: DEMO.holdToAsk });
    await fireEvent(hold, "pressIn");
    expect(screen.getByText(DEMO.indicatorHold)).toBeTruthy();
    await fireEvent(hold, "pressOut");
    expect(screen.getByText(DEMO.indicatorOff)).toBeTruthy();
    expect(await screen.findByText(DEMO.mockLabel, {}, WAIT)).toBeTruthy();
  });

  it("asks by holding the button, and uses the scene's first sample as the transcript", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.MENU.title);
    const hold = screen.getByRole("button", { name: DEMO.holdToAsk });
    await fireEvent(hold, "pressIn");
    await fireEvent(hold, "pressOut");
    expect(screen.getByText(DEMO.transcriptLabel)).toBeTruthy();
    expect(await screen.findByText(DEMO.mockLabel, {}, WAIT)).toBeTruthy();
  });

  it("makes no network call during the whole interaction", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.STREET_SIGN.title);
    await press(DEMO.photo);
    await screen.findByText(DEMO.indicatorOff, {}, WAIT);
    await press(DEMO.questions.SIGN_DIRECTION);
    await screen.findByText(DEMO.statusDone, {}, WAIT);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("goes back to the home screen with the back button", async () => {
    const onBack = jest.fn();
    await render(<DemoScreen onBack={onBack} />);
    await press(DEMO.back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("demo screen: errors and limits", () => {
  const cases: [DemoScenario, DemoErrorCode][] = [
    ["PROVIDER_TIMEOUT", "TIMEOUT"],
    ["PROVIDER_UNAVAILABLE", "UNAVAILABLE"],
    ["SPEND_CAP", "CAP_REACHED"],
    ["OFFLINE", "OFFLINE"],
  ];

  it.each(cases)(
    "shows the %s message as an alert, with a recovery action",
    async (scenario, code) => {
      await render(<DemoScreen onBack={jest.fn()} />);
      await choose(DEMO.scenarios[scenario]);
      await press(DEMO.scenes.STREET_SIGN.title);
      await press(DEMO.questions.SIGN_SAYS);

      expect(await screen.findByText(DEMO.errors[code], {}, WAIT)).toBeTruthy();
      expect(screen.getByRole("alert")).toBeTruthy();

      if (code === "CAP_REACHED") {
        expect(screen.getByText(DEMO.budgetLine(1000, 1000), { exact: false })).toBeTruthy();
        expect(screen.queryByRole("button", { name: DEMO.retry })).toBeNull();
        await press(DEMO.backToQuestions);
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByText(DEMO.transcriptLabel)).toBeNull();
        return;
      }

      await press(DEMO.retry);
      expect(await screen.findByText(DEMO.errors[code], {}, WAIT)).toBeTruthy();
    },
  );

  it("shows the budget as MOCK, with the spend against the cap", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    expect(screen.getByText(DEMO.budgetTitle)).toBeTruthy();
    expect(screen.getByText(DEMO.budgetLine(0, 1000))).toBeTruthy();
  });

  it("shows no error for the normal scenario", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.MENU.title);
    await press(DEMO.questions.CHEAPEST_ITEM);
    await screen.findByText(DEMO.mockLabel, {}, WAIT);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * Matches the one element whose text contains every given part, in any order. Used to check that a label and
 * its output share one element. Each part is escaped, so punctuation such as parentheses is literal.
 */
function elementWith(...parts: readonly string[]): RegExp {
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.map((part) => `(?=[\\s\\S]*${part})`).join(""));
}

describe("demo screen: read the text (MOCK OCR)", () => {
  let fetchSpy: jest.Mock;
  let realFetch: typeof fetch;

  beforeEach(() => {
    realFetch = global.fetch;
    fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("keeps the read-the-text control off until a scene is chosen", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    expect(
      screen.getByRole("button", { name: DEMO.ocr.button }).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("shows the fixture text with the MOCK label and the SYNTHETIC note in one element", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.STREET_SIGN.title);
    await press(DEMO.ocr.button);

    expect(
      screen.getByText(elementWith(DEMO.ocr.label, DEMO.ocr.sourceNote, "ONE WAY")),
    ).toBeTruthy();
    expect(screen.queryByText(DEMO.ocr.noText)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads each line of a scene with several lines of text", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.MEDICINE_LABEL.title);
    await press(DEMO.ocr.button);
    for (const line of DEMO.ocr.fixtureLines.MEDICINE_LABEL) {
      expect(screen.getByText(elementWith(DEMO.ocr.label, line))).toBeTruthy();
    }
  });

  it("says it could not read the text clearly, with the MOCK label, for the plain wall", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.PLAIN_WALL.title);
    await press(DEMO.ocr.button);
    expect(screen.getByText(elementWith(DEMO.ocr.label, DEMO.ocr.noText))).toBeTruthy();
  });

  it("clears the reading when another scene is chosen", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.MENU.title);
    await press(DEMO.ocr.button);
    expect(screen.getByText(elementWith(DEMO.ocr.label))).toBeTruthy();
    await press(DEMO.scenes.STREET_SIGN.title);
    expect(screen.queryByText(elementWith(DEMO.ocr.label))).toBeNull();
  });
});

describe("demo screen: live translation (MOCK)", () => {
  const WAIT_FOR_SILENCE = { timeout: 12_000 };
  let fetchSpy: jest.Mock;
  let realFetch: typeof fetch;

  beforeEach(() => {
    realFetch = global.fetch;
    fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("starts with the announcement and the indicator on, and sends nothing", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.translation.start);

    expect(
      screen.getByText(
        elementWith(DEMO.translation.announcementLabel, TRANSLATION_START_ANNOUNCEMENT),
      ),
    ).toBeTruthy();
    expect(screen.getByText(DEMO.indicatorTranslation)).toBeTruthy();
    expect(screen.getByText(elementWith(DEMO.translation.countdown("2:00")))).toBeTruthy();
    expect(screen.queryByRole("button", { name: DEMO.translation.start })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("translates a phrase in the table, with the MOCK label in the same element", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.translation.start);
    await press(DEMO.translation.phraseButton(DEMO.translation.phrases.GREETING));

    expect(
      screen.getByText(
        elementWith(
          DEMO.translation.resultLabel,
          DEMO.translation.languages.TELUGU,
          "శుభోదయం",
          DEMO.translation.languages.HINDI,
          "सुप्रभात",
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        elementWith(DEMO.translation.transcriptLabel, DEMO.translation.phrases.GREETING),
      ),
    ).toBeTruthy();
    expect(screen.queryByText(elementWith("(unsure)"))).toBeNull();
  });

  it("marks a word that is not in the table as unsure, for a phrase not in the table", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.translation.start);
    await press(DEMO.translation.phraseButton(DEMO.translation.phrases.NOT_IN_TABLE));

    expect(
      screen.getByText(elementWith(DEMO.translation.resultLabel, "quantum (unsure)")),
    ).toBeTruthy();
    expect(
      screen.getByText(elementWith(DEMO.translation.resultLabel, "orchard (unsure)")),
    ).toBeTruthy();
  });

  it("stops on the Stop button, clears the translation, and says nothing is kept", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.translation.start);
    await press(DEMO.translation.phraseButton(DEMO.translation.phrases.GREETING));
    await press(DEMO.translation.stop);

    expect(screen.getByText(DEMO.translation.stopped)).toBeTruthy();
    expect(screen.getByText(DEMO.indicatorOff)).toBeTruthy();
    expect(screen.queryByText(elementWith(DEMO.translation.resultLabel))).toBeNull();
    expect(screen.queryByText(elementWith(DEMO.translation.countdown("2:00")))).toBeNull();
    expect(screen.getByRole("button", { name: DEMO.translation.start })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops by itself after the silence limit, with the countdown shown as SIMULATED", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.translation.start);

    expect(
      await screen.findByText(DEMO.translation.silenceStopped(2), {}, WAIT_FOR_SILENCE),
    ).toBeTruthy();
    expect(screen.getByText(DEMO.indicatorOff)).toBeTruthy();
    expect(screen.queryByRole("button", { name: DEMO.translation.stop })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 20_000);

  it("refuses a translation while a photo or an answer is running", async () => {
    await render(<DemoScreen onBack={jest.fn()} />);
    await press(DEMO.scenes.MENU.title);
    await press(DEMO.photo);
    expect(
      screen.getByRole("button", { name: DEMO.translation.start }).props.accessibilityState
        .disabled,
    ).toBe(true);
    await screen.findByText(DEMO.indicatorOff, {}, WAIT);
    expect(
      screen.getByRole("button", { name: DEMO.translation.start }).props.accessibilityState
        .disabled,
    ).toBe(false);
  });
});
