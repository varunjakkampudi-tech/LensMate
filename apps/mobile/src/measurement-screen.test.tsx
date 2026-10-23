import { fireEvent, render, screen } from "@testing-library/react-native";
import type { LinkStatus } from "@lensmate/core";
import { MeasurementScreen, type SimulatedGlasses } from "./measurement-screen";
import { STRINGS } from "./strings";

const TEXT = STRINGS.measurement;

/** Glasses double with no real link: connect, disconnect and button input are recorded. */
class FakeSimulatedGlasses implements SimulatedGlasses {
  status: LinkStatus = "disconnected";
  lastButtonAtMs: number | undefined = undefined;
  presses: string[] = [];
  connectFails = false;

  connect(): Promise<void> {
    if (this.connectFails) {
      return Promise.reject(new Error("no link"));
    }
    this.status = "connected";
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.status = "disconnected";
    return Promise.resolve();
  }

  send(): Promise<void> {
    return Promise.resolve();
  }

  subscribe(): () => void {
    return () => undefined;
  }

  pressButton(action: string): void {
    this.presses.push(action);
  }
}

function renderScreen(glasses: SimulatedGlasses = new FakeSimulatedGlasses()) {
  return render(<MeasurementScreen glasses={glasses} clock={() => 0} />);
}

describe("MeasurementScreen: initial state", () => {
  it("shows no tries and no session before anything is done", async () => {
    await renderScreen();
    expect(screen.getByText(TEXT.noTries)).toBeTruthy();
    expect(screen.getByText(TEXT.sessionIdle)).toBeTruthy();
  });

  it("lists every measure, and marks all but capture to phone as not instrumented", async () => {
    await renderScreen();
    expect(
      screen.getByLabelText(/Capture to phone\. Instrumented\. Target: 300 ms or less/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Total short request\. Not instrumented\./)).toBeTruthy();
    expect(screen.getByLabelText(/Interruption\. Not instrumented\./)).toBeTruthy();
    expect(
      screen.getByLabelText(/Speech accuracy \(word error rate\)\. Not instrumented\./),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Translation scripts\. Not instrumented\./)).toBeTruthy();
    expect(screen.getByLabelText(/Spend per request\. Not instrumented\./)).toBeTruthy();
  });

  it("offers the four languages from the approved procedure as radio buttons, with English selected", async () => {
    await renderScreen();
    expect(screen.getByRole("radio", { name: "English", checked: true })).toBeTruthy();
    for (const name of ["Telugu", "Hindi", "Mixed speech"]) {
      expect(screen.getByRole("radio", { name, checked: false })).toBeTruthy();
    }
  });

  it("does not export before any try is recorded", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.exportButton }));
    expect(await screen.findByText(TEXT.exportNeedsTries)).toBeTruthy();
    expect(screen.queryByLabelText(TEXT.exportTextLabel)).toBeNull();
  });
});

describe("MeasurementScreen: errors and disabled states", () => {
  it("refuses to start a session until the glasses are connected", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));
    expect(await screen.findByText(TEXT.startNeedsConnection)).toBeTruthy();
  });

  it("lists the missing provenance and does not start the session", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected);

    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));

    expect(await screen.findByText(TEXT.problemsTitle)).toBeTruthy();
    expect(screen.getByText("• Run ID is missing")).toBeTruthy();
    expect(screen.getByText("• Choose the evidence level")).toBeTruthy();
    expect(screen.getByText(TEXT.sessionIdle)).toBeTruthy();
  });

  it("shows a clear alert when the glasses cannot be connected", async () => {
    const glasses = new FakeSimulatedGlasses();
    glasses.connectFails = true;
    await renderScreen(glasses);

    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(STRINGS.connectFailed)).toBeTruthy();
  });

  it("keeps the simulated tap disabled when no session is running, so no tap is sent", async () => {
    const glasses = new FakeSimulatedGlasses();
    await renderScreen(glasses);
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected);

    const tap = screen.getByRole("button", { name: TEXT.sendTap });
    expect(tap.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(tap);

    expect(glasses.presses).toEqual([]);
  });
});

describe("MeasurementScreen: connection", () => {
  it("disconnects the glasses when no session is running", async () => {
    const glasses = new FakeSimulatedGlasses();
    await renderScreen(glasses);
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected);

    await fireEvent.press(screen.getByRole("button", { name: TEXT.disconnectVirtual }));

    expect(await screen.findByText(TEXT.notConnected)).toBeTruthy();
    expect(glasses.status).toBe("disconnected");
  });
});

describe("MeasurementScreen: accessibility", () => {
  it("gives every action button a role and a name", async () => {
    await renderScreen();
    for (const name of [
      TEXT.connectVirtual,
      TEXT.startSession,
      TEXT.endSession,
      TEXT.sendTap,
      TEXT.exportButton,
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("groups the evidence, run-by and network choices as labelled radio groups", async () => {
    await renderScreen();
    for (const label of [
      TEXT.evidenceGroup,
      TEXT.runByGroup,
      TEXT.networkGroup,
      TEXT.languageGroup,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("labels every text field, so a screen reader announces what to type", async () => {
    await renderScreen();
    for (const label of [
      TEXT.runId,
      TEXT.deviceModel,
      TEXT.osVersion,
      TEXT.appBuild,
      TEXT.appCommit,
      TEXT.sampleSet,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("shows the connection and session status as text, not only as colour or position", async () => {
    await renderScreen();
    expect(screen.getByText(TEXT.notConnected)).toBeTruthy();
    expect(screen.getByText(TEXT.sessionIdle)).toBeTruthy();
  });

  it("does not hide the not-instrumented status behind colour alone", async () => {
    await renderScreen();
    expect(screen.getAllByText(TEXT.notInstrumented).length).toBeGreaterThan(0);
  });

  it("keeps the connection state accurate when the glasses report connected at start", async () => {
    const glasses = new FakeSimulatedGlasses();
    glasses.status = "connected";
    await renderScreen(glasses);
    expect(screen.getByText(STRINGS.statusConnected)).toBeTruthy();
  });
});
