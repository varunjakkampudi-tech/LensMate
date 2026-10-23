import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { importMeasurementCsv } from "@lensmate/core";
import { ProtocolCodec, loadBundledProtocolRoot } from "@lensmate/protocol";
import { VirtualGlasses } from "@lensmate/simulator";
import { MeasurementScreen } from "./measurement-screen";
import { STRINGS } from "./strings";

const TEXT = STRINGS.measurement;

/** The whole flow runs under coverage and in parallel with other suites, so allow for a slow machine. */
jest.setTimeout(30_000);
const FIND = { timeout: 10_000 };

/**
 * End-to-end: the operator's workflow on the measurement screen, through the virtual glasses simulator.
 * The glasses and the screen share one clock, which is the rule for valid same-clock timing. Each tap is
 * timed from the glasses' button event to the phone's receipt, and the export goes through the real validator.
 * Simulator evidence only: nothing here is a physical-device measurement.
 */
function fakeClock(): () => number {
  let now = 0;
  return () => {
    now += 5;
    return now;
  };
}

async function fillProvenance(): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(TEXT.runId), "e2e-run-1");
  await fireEvent.press(screen.getByRole("radio", { name: "Simulator" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Agent (dry run)" }));
  await fireEvent.changeText(
    screen.getByLabelText(TEXT.deviceModel),
    "virtual glasses simulator (no phone)",
  );
  await fireEvent.changeText(screen.getByLabelText(TEXT.osVersion), "not applicable");
  await fireEvent.changeText(screen.getByLabelText(TEXT.appBuild), "dev");
  await fireEvent.changeText(screen.getByLabelText(TEXT.appCommit), "e2e");
  await fireEvent.press(screen.getByRole("radio", { name: "Simulated" }));
  await fireEvent.changeText(screen.getByLabelText(TEXT.sampleSet), "scripted presses");
}

describe("measurement screen end to end (virtual glasses)", () => {
  it("records tries through simulated taps, then exports a CSV the validator accepts", async () => {
    const clock = fakeClock();
    const glasses = new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()), clock);
    await render(<MeasurementScreen glasses={glasses} clock={clock} />);

    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected, FIND);

    await fillProvenance();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));
    expect(await screen.findByText(`${TEXT.sessionRunning}: English`, FIND)).toBeTruthy();

    await fireEvent.press(screen.getByRole("radio", { name: "Telugu" }));
    for (let index = 0; index < 3; index += 1) {
      await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));
    }
    expect(await screen.findByText(TEXT.tallyLine("Telugu", 3, 3, 0), FIND)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: TEXT.endSession }));
    expect(await screen.findByText(TEXT.sessionIdle, FIND)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: TEXT.exportButton }));
    expect(await screen.findByText(TEXT.exportSummary(3, 0), FIND)).toBeTruthy();

    const csvField = screen.getByLabelText(TEXT.exportTextLabel);
    const csv = String(csvField.props.value);
    const result = importMeasurementCsv(csv);
    expect(result.fileErrors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted.map((record) => record.language)).toEqual(["te", "te", "te"]);
    expect(result.accepted.every((record) => record.timingSource === "same_clock_simulator")).toBe(
      true,
    );
    expect(result.accepted.every((record) => record.evidenceLevel === "simulator")).toBe(true);
    expect(result.accepted.every((record) => record.runByRole === "agent")).toBe(true);
    expect(result.accepted.every((record) => record.measure === "capture_to_phone")).toBe(true);

    expect(
      screen.getByText(
        "simulator, same_clock_simulator, capture_to_phone, Telugu: 3 tries, 3 measured, 3 within budget",
      ),
    ).toBeTruthy();
  });

  it("keeps the tries of each language separate, and records the language on each one", async () => {
    const clock = fakeClock();
    const glasses = new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()), clock);
    await render(<MeasurementScreen glasses={glasses} clock={clock} />);
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected, FIND);
    await fillProvenance();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));

    await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));
    await fireEvent.press(screen.getByRole("radio", { name: "Hindi" }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));

    expect(await screen.findByText(TEXT.tallyLine("English", 1, 1, 0), FIND)).toBeTruthy();
    expect(screen.getByText(TEXT.tallyLine("Hindi", 2, 2, 0))).toBeTruthy();
  });

  it("exports a finished session with no rejected rows and no error lines", async () => {
    const clock = fakeClock();
    const glasses = new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()), clock);
    await render(<MeasurementScreen glasses={glasses} clock={clock} />);
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected, FIND);
    await fillProvenance();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.endSession }));

    // Provenance is locked while a session runs and is used as recorded, so the export is complete.
    await fireEvent.press(screen.getByRole("button", { name: TEXT.exportButton }));
    const summary = await screen.findByText(TEXT.exportSummary(1, 0), FIND);
    expect(summary).toBeTruthy();
    const region = within(screen.getByLabelText(TEXT.exportRejected));
    expect(region.queryByText(/Line /)).toBeNull();
  });

  it("does not show any real phone claim for a simulator run", async () => {
    const clock = fakeClock();
    const glasses = new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()), clock);
    await render(<MeasurementScreen glasses={glasses} clock={clock} />);
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected, FIND);
    await fillProvenance();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.endSession }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.exportButton }));
    await screen.findByText(TEXT.exportSummary(1, 0), FIND);

    const csv = String(screen.getByLabelText(TEXT.exportTextLabel).props.value);
    expect(csv).toContain(",simulator,same_clock_simulator,");
    expect(csv).not.toContain("real phone");
  });
});

describe("timestamp correctness", () => {
  it("records failed tries, not latencies, when the glasses and the screen do not share a clock", async () => {
    // The glasses run on a clock that is far ahead of the screen's clock. The phone must not subtract them.
    const glassesClock = () => 10_000;
    const screenClock = () => 5;
    const glasses = new VirtualGlasses(new ProtocolCodec(loadBundledProtocolRoot()), glassesClock);
    await render(<MeasurementScreen glasses={glasses} clock={screenClock} />);
    await fireEvent.press(screen.getByRole("button", { name: TEXT.connectVirtual }));
    await screen.findByText(STRINGS.statusConnected, FIND);
    await fillProvenance();
    await fireEvent.press(screen.getByRole("button", { name: TEXT.startSession }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.sendTap }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.endSession }));
    await fireEvent.press(screen.getByRole("button", { name: TEXT.exportButton }));

    expect(await screen.findByText(TEXT.exportSummary(1, 0), FIND)).toBeTruthy();
    expect(screen.getByText(TEXT.tallyLine("English", 1, 0, 1))).toBeTruthy();
    const csv = String(screen.getByLabelText(TEXT.exportTextLabel).props.value);
    expect(csv).toContain("phone clock is earlier than the glasses timestamp; try not timed");
  });
});
