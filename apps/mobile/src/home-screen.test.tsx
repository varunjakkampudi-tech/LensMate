import { fireEvent, render, screen } from "@testing-library/react-native";
import HomeScreen from "../app/index";
import { STRINGS } from "./strings";

describe("HomeScreen", () => {
  it("shows the disconnected state and connects to the virtual glasses on press", async () => {
    await render(<HomeScreen />);
    expect(screen.getByText(STRINGS.statusDisconnected)).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: STRINGS.connect }));

    expect(await screen.findByText(STRINGS.statusConnected)).toBeTruthy();
    expect(screen.getByRole("button", { name: STRINGS.disconnect })).toBeTruthy();
  });

  it("returns to the disconnected state after disconnect", async () => {
    await render(<HomeScreen />);
    fireEvent.press(screen.getByRole("button", { name: STRINGS.connect }));
    await screen.findByText(STRINGS.statusConnected);

    fireEvent.press(screen.getByRole("button", { name: STRINGS.disconnect }));

    expect(await screen.findByText(STRINGS.statusDisconnected)).toBeTruthy();
  });
});
