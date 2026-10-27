import { render, screen } from "@testing-library/react-native";
import HomeScreen from "../app/index";

describe("HomeScreen", () => {
  it("keeps the product surface focused on capture, questions, and memory", async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole("button", { name: "Capture and ask" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask LensMate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Personal memory" })).toBeTruthy();
    expect(screen.queryByText(/translation|automation|guided demo/i)).toBeNull();
  });
});
