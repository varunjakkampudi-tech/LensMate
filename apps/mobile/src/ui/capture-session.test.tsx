import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { CaptureProvider, useCapture } from "./capture-session";

let api: ReturnType<typeof useCapture>;
function Probe() {
  api = useCapture();
  return (
    <Pressable accessibilityRole="button" onPress={api.stopAll}>
      <Text>{api.active === null ? "idle" : api.active.label}</Text>
    </Pressable>
  );
}

describe("capture sessions", () => {
  it("lets only the newest session clear the indicator", async () => {
    await render(
      <CaptureProvider>
        <Probe />
      </CaptureProvider>,
    );
    const stopFirst = jest.fn();
    let first = 0;
    await act(async () => {
      first = api.begin("microphone", "Voice question", stopFirst);
    });
    await act(async () => {
      api.begin("microphone", "Translation session", jest.fn());
    });
    expect(stopFirst).toHaveBeenCalledTimes(1);
    await act(async () => api.end(first));
    expect(await screen.findByText("Translation session")).toBeTruthy();
  });

  it("Stop runs the session's own cleanup and clears the indicator", async () => {
    await render(
      <CaptureProvider>
        <Probe />
      </CaptureProvider>,
    );
    const stop = jest.fn();
    await act(async () => {
      api.begin("camera", "Vision session", stop);
    });
    await fireEvent.press(await screen.findByRole("button"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("idle")).toBeTruthy();
  });
});
