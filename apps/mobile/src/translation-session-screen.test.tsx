import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SILENCE_TIMEOUT_MS,
  TRANSLATION_START_ANNOUNCEMENT,
  type LinkStatus,
} from "@lensmate/core";
import { loadBundledProtocolRoot, ProtocolCodec, type EnvelopeMessage } from "@lensmate/protocol";
import { VirtualGlasses, type SimulatorEvent } from "@lensmate/simulator";
import { STRINGS } from "./strings";
import { TranslationSessionScreen } from "./translation-session-screen";
import type { TranslationSessionLink } from "./use-translation-session";

const T = STRINGS.translationSession;

// Loads the React Native components the screen renders at file load, not inside the first test.
void [ActivityIndicator, Pressable, ScrollView, Text, View];

/** A short real tick, so the screen's interval runs during the test without making it slow. */
const TICK_MS = 5;

interface Harness {
  readonly glasses: VirtualGlasses;
  /** The clock both the glasses and the screen read. Only the test moves it. */
  readonly now: () => number;
  readonly advance: (ms: number) => void;
}

function harness(): Harness {
  let current = 0;
  const glasses = new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()), () => current);
  return {
    glasses,
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

async function renderScreen(h: Harness): Promise<void> {
  await render(<TranslationSessionScreen link={h.glasses} clock={h.now} tickMs={TICK_MS} />);
  await settle();
}

/** Lets React and the screen's interval run: a few ticks of real time, inside act. */
async function settle(ms = TICK_MS * 4): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  });
}

/** Moves the shared clock forward, then lets the screen's ticks read it. */
async function passTime(h: Harness, ms: number): Promise<void> {
  h.advance(ms);
  await settle();
}

async function connectedHarness(): Promise<Harness> {
  const h = harness();
  await h.glasses.connect();
  return h;
}

function button(name: string) {
  return screen.getByRole("button", { name });
}

function isDisabled(name: string): boolean {
  return button(name).props.accessibilityState.disabled === true;
}

/** A link whose requests never finish, to show the loading state. Nothing here touches the network. */
function pendingLink(status: LinkStatus): TranslationSessionLink & { readonly send: jest.Mock } {
  return {
    status,
    connect: jest.fn(() => new Promise<void>(() => undefined)),
    disconnect: jest.fn(() => Promise.resolve()),
    send: jest.fn(() => new Promise<void>(() => undefined)),
    subscribe: (_handler: (message: EnvelopeMessage) => void) => () => undefined,
    subscribeEvents: (_handler: (event: SimulatorEvent) => void) => () => undefined,
    checkSilence: jest.fn(),
  };
}

describe("TranslationSessionScreen: offline and empty states", () => {
  it("shows the offline state, a connect button, and disabled start buttons before the glasses connect", async () => {
    await renderScreen(harness());
    expect(screen.getByText(T.glassesOffline)).toBeTruthy();
    expect(screen.getByText(T.offlineAction)).toBeTruthy();
    expect(button(T.connect)).toBeTruthy();
    expect(isDisabled(T.startTranslation)).toBe(true);
    expect(isDisabled(T.startCaptions)).toBe(true);
  });

  it("connects from the offline state, then shows the empty state with both starts enabled", async () => {
    await renderScreen(harness());
    fireEvent.press(button(T.connect));
    expect(await screen.findByText(T.glassesConnected)).toBeTruthy();
    expect(screen.getByText(T.idle)).toBeTruthy();
    expect(screen.getByText(T.noCaptions)).toBeTruthy();
    expect(screen.getByText(T.indicatorOff)).toBeTruthy();
    expect(isDisabled(T.startTranslation)).toBe(false);
    expect(isDisabled(T.startCaptions)).toBe(false);
  });

  it("shows a loading state while the glasses are connecting", async () => {
    const link = pendingLink("disconnected");
    await render(<TranslationSessionScreen link={link} clock={() => 0} />);
    fireEvent.press(button(T.connect));
    expect(await screen.findByText(T.connecting)).toBeTruthy();
    expect(link.connect).toHaveBeenCalledTimes(1);
  });

  it("shows a connection failure as an alert", async () => {
    const link = pendingLink("disconnected");
    link.connect = jest.fn(() => Promise.reject(new Error("no radio")));
    await render(<TranslationSessionScreen link={link} clock={() => 0} />);
    fireEvent.press(button(T.connect));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").props.children).toBe(T.errors.connectFailed);
  });
});

describe("TranslationSessionScreen: start and stop", () => {
  it("starts translation: indicator on for translation, the announcement in the status line, and a stop button", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startTranslation));
    expect(await screen.findByText(T.indicatorOn("translation"))).toBeTruthy();
    expect(screen.getByText(TRANSLATION_START_ANNOUNCEMENT)).toBeTruthy();
    expect(screen.getByText(T.countdown("2:00"))).toBeTruthy();
    expect(button(T.stopTranslation)).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.startTranslation })).toBeNull();
    expect(h.glasses.spoken).toEqual([TRANSLATION_START_ANNOUNCEMENT]);
  });

  it("stops translation from the phone: indicator off, the stop reason shown, and the start buttons back", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startTranslation));
    await screen.findByText(T.indicatorOn("translation"));
    await settle();
    fireEvent.press(button(T.stopTranslation));
    expect(await screen.findByText(T.indicatorOff)).toBeTruthy();
    expect(screen.getByText(T.ended.APP)).toBeTruthy();
    expect(isDisabled(T.startTranslation)).toBe(false);
    expect(h.glasses.indicatorOn).toBe(false);
  });

  it("starts and stops captions, with the caption status and no translation announcement", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startCaptions));
    expect(await screen.findByText(T.indicatorOn("captions"))).toBeTruthy();
    expect(screen.getByText(T.captionsRunning)).toBeTruthy();
    expect(h.glasses.eventLog.some((event) => event.kind === "ANNOUNCEMENT")).toBe(false);
    await settle();
    fireEvent.press(button(T.stopCaptions));
    expect(await screen.findByText(T.indicatorOff)).toBeTruthy();
  });

  it("shows a visible error when the glasses refuse a start because they are capturing", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    await act(() => {
      h.glasses.pressButton("BUTTON_ACTION_HOLD");
    });
    fireEvent.press(button(T.startTranslation));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").props.children).toBe(T.errors.busy);
    expect(screen.getByText(T.indicatorOn("a question"))).toBeTruthy();
    expect(screen.getByText(T.otherCapture)).toBeTruthy();
  });

  it("shows a visible error when the request cannot be sent because the link has dropped", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    await h.glasses.disconnect();
    fireEvent.press(button(T.startTranslation));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").props.children).toBe(T.errors.notConnected);
    expect(h.glasses.indicatorOn).toBe(false);
  });

  it("shows the loading state while a start request is still waiting for the glasses", async () => {
    const link = pendingLink("connected");
    await render(<TranslationSessionScreen link={link} clock={() => 0} />);
    fireEvent.press(button(T.startTranslation));
    expect(await screen.findByText(T.starting)).toBeTruthy();
    expect(isDisabled(T.startTranslation)).toBe(true);
    expect(link.send).toHaveBeenCalledTimes(1);
  });

  it("does not send a second request while one is still waiting", async () => {
    const link = pendingLink("connected");
    await render(<TranslationSessionScreen link={link} clock={() => 0} />);
    fireEvent.press(button(T.startTranslation));
    await screen.findByText(T.starting);
    fireEvent.press(button(T.startCaptions));
    await settle();
    expect(link.send).toHaveBeenCalledTimes(1);
  });
});

describe("TranslationSessionScreen: silence countdown", () => {
  it("counts down as time passes, and resets when speech is heard", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startTranslation));
    await screen.findByText(T.indicatorOn("translation"));
    await passTime(h, 60_000);
    expect(screen.getByText(T.countdown("1:00"))).toBeTruthy();
    await act(() => {
      h.glasses.heardSpeech();
    });
    await settle();
    expect(screen.getByText(T.countdown("2:00"))).toBeTruthy();
    await passTime(h, 30_000);
    expect(screen.getByText(T.countdown("1:30"))).toBeTruthy();
  });

  it("stops the translation after two minutes of silence and says why", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startTranslation));
    await screen.findByText(T.indicatorOn("translation"));
    await passTime(h, SILENCE_TIMEOUT_MS);
    expect(await screen.findByText(T.ended.SILENCE)).toBeTruthy();
    expect(screen.getByText(T.indicatorOff)).toBeTruthy();
    expect(screen.queryByText(T.countdown("0:00"))).toBeNull();
    expect(isDisabled(T.startTranslation)).toBe(false);
  });
});

describe("TranslationSessionScreen: captions", () => {
  it("shows caption text the glasses deliver during a session", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startTranslation));
    await screen.findByText(T.indicatorOn("translation"));
    await act(() => {
      h.glasses.deliverCaption("Good morning");
      h.glasses.deliverCaption("How are you");
    });
    expect(await screen.findByText("Good morning")).toBeTruthy();
    expect(screen.getByText("How are you")).toBeTruthy();
    expect(screen.queryByText(T.noCaptions)).toBeNull();
  });
});

describe("TranslationSessionScreen: glasses input during a translation session", () => {
  it("ignores taps during a translation session: the indicator and the session stay as they were", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    fireEvent.press(button(T.startTranslation));
    await screen.findByText(T.indicatorOn("translation"));
    await act(() => {
      h.glasses.pressButton("BUTTON_ACTION_SINGLE_TAP");
      h.glasses.pressButton("BUTTON_ACTION_DOUBLE_TAP");
    });
    await settle();
    expect(h.glasses.gestureEffects).toEqual([]);
    expect(screen.getByText(T.indicatorOn("translation"))).toBeTruthy();
    expect(button(T.stopTranslation)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("follows a voice start and a voice stop from the glasses", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    await act(() => {
      h.glasses.pressButton("BUTTON_ACTION_HOLD");
      h.glasses.voiceCommand("start translation");
    });
    expect(await screen.findByText(T.indicatorOn("translation"))).toBeTruthy();
    expect(screen.getByText(TRANSLATION_START_ANNOUNCEMENT)).toBeTruthy();
    await act(() => {
      h.glasses.voiceCommand("stop translation");
    });
    expect(await screen.findByText(T.indicatorOff)).toBeTruthy();
    expect(screen.getByText(T.ended.VOICE)).toBeTruthy();
  });
});

describe("TranslationSessionScreen: accessibility and network", () => {
  it("gives every action a button role, a label, and a 48 dp target", async () => {
    const h = await connectedHarness();
    await renderScreen(h);
    for (const name of [T.startTranslation, T.startCaptions]) {
      const style = StyleSheet.flatten(button(name).props.style);
      expect(style.minHeight).toBe(48);
      expect(style.minWidth).toBe(48);
      expect(button(name).props.accessibilityLabel).toBe(name);
    }
  });

  it("makes no network request while a session runs and stops", async () => {
    const fetchSpy = jest.fn(() =>
      Promise.reject(new Error("network is not allowed in this test")),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const h = await connectedHarness();
      await renderScreen(h);
      fireEvent.press(button(T.startTranslation));
      await screen.findByText(T.indicatorOn("translation"));
      await settle();
      fireEvent.press(button(T.stopTranslation));
      await screen.findByText(T.indicatorOff);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});
