import { fireEvent, render, screen } from "@testing-library/react-native";
import HomeScreen from "../../app/index";
import { DemoScreen } from "./demo-screen";
import { DEMO } from "./demo-strings";
import type { DemoErrorCode, DemoScenario } from "./demo-model";

const mockPush = jest.fn();

// The home button navigates with the router; the router itself is not under test here.
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), navigate: jest.fn() },
}));

/** Waits longer than the demo's simulated pace, without making the suite slow. */
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
