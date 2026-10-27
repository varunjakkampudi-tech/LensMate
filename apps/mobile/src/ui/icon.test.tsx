import { render, screen } from "@testing-library/react-native";
import { Icon, type IconName } from "./icon";

// The phone draws icons with react-native-svg. It is stood in here by a view with a test ID, so the test can see that a
// graphic is drawn. Regression: native icons used to render the first letter of the name (G, C, M, S).
jest.mock("react-native-svg", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: (props: object) => React.createElement(View, { testID: "icon-svg", ...props }),
    Path: (props: object) => React.createElement(View, { testID: "icon-path", ...props }),
  };
});

describe("native icons", () => {
  it.each(["camera", "mic", "glasses", "bell", "home"] as IconName[])(
    "draws %s as a graphic, with no letter placeholder",
    async (name) => {
      await render(<Icon name={name} color="#fff" size={24} />);

      expect(screen.getByTestId("icon-svg")).toBeTruthy();
      expect(screen.getByTestId("icon-path").props.d).toEqual(expect.any(String));
      expect(screen.queryByText(/^[A-Za-z]$/)).toBeNull();
    },
  );
});
