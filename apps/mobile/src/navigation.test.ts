import { goHome, type HomeNavigator } from "./navigation";

describe("goHome", () => {
  it("navigates to the home screen, not back", () => {
    const calls: string[] = [];
    const navigator: HomeNavigator & { back?: () => void } = {
      navigate: (href) => {
        calls.push(`navigate ${href}`);
      },
      back: () => {
        calls.push("back");
      },
    };
    goHome(navigator);
    expect(calls).toEqual(["navigate /"]);
  });
});
