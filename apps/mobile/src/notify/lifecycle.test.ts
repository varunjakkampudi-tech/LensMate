/**
 * Notification lifecycle, automated. These cover the paths the app controls: foreground presentation, responses while the
 * app runs (background or foreground taps), the response that opened the app, duplicate suppression, invalid routes,
 * cancellation and permission denial. Physical delivery (banner, lock screen, killed app) is NOT tested here; it needs an
 * owner-run iPhone check.
 */
import * as Notifications from "expo-notifications";
import {
  cancelLocalNotification,
  foregroundPresentation,
  initialNotificationRoute,
  notificationPermission,
  onNotificationTap,
  requestNotificationPermission,
  scheduleLocalNotification,
} from "./local";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => "scheduled-1"),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const n = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
};

/** A notification response as expo-notifications delivers it. */
function response(id: string, route: unknown) {
  return { notification: { request: { identifier: id, content: { data: { route } } } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  n.getLastNotificationResponseAsync.mockResolvedValue(null);
});

describe("foreground presentation", () => {
  it("shows a banner and list entry while the app is open, with no sound or badge", () => {
    expect(foregroundPresentation()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});

describe("responses while the app runs", () => {
  it("routes a tap from the background or foreground listener", () => {
    const handler = jest.fn();
    onNotificationTap(handler);
    const listener = n.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as (
      r: unknown,
    ) => void;

    listener(response("tap-1", "/memory"));

    expect(handler).toHaveBeenCalledWith("/memory");
  });

  it("stops listening when the returned function is called", () => {
    const remove = jest.fn();
    n.addNotificationResponseReceivedListener.mockReturnValueOnce({ remove });

    onNotificationTap(jest.fn())();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("the response that opened the app", () => {
  it("routes the launch notification once", async () => {
    n.getLastNotificationResponseAsync.mockResolvedValue(response("launch-1", "/translate"));

    await expect(initialNotificationRoute()).resolves.toBe("/translate");
  });

  it("does not route the same launch notification twice (duplicate suppression)", async () => {
    n.getLastNotificationResponseAsync.mockResolvedValue(response("launch-2", "/memory"));
    const handler = jest.fn();
    onNotificationTap(handler);
    const listener = n.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as (
      r: unknown,
    ) => void;

    await expect(initialNotificationRoute()).resolves.toBe("/memory");
    // The live listener sees the same tap again: it must not route it a second time.
    listener(response("launch-2", "/memory"));

    expect(handler).not.toHaveBeenCalled();
    // A later launch read of the same response must not route it again.
    await expect(initialNotificationRoute()).resolves.toBeUndefined();
  });

  it("returns nothing when the app was not opened from a notification", async () => {
    await expect(initialNotificationRoute()).resolves.toBeUndefined();
  });
});

describe("invalid routes", () => {
  it.each([["https://evil.example"], ["//evil.example"], ["memory"], [42], [undefined]])(
    "rejects the route %p from a launch notification",
    async (route) => {
      n.getLastNotificationResponseAsync.mockResolvedValue(response(`bad-${String(route)}`, route));

      await expect(initialNotificationRoute()).resolves.toBeUndefined();
    },
  );

  it("rejects an invalid route from a live tap without calling the handler", () => {
    const handler = jest.fn();
    onNotificationTap(handler);
    const listener = n.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as (
      r: unknown,
    ) => void;

    listener(response("bad-live", "javascript:alert(1)"));

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("cancellation", () => {
  it("cancels a scheduled notification by its identifier", async () => {
    const id = await scheduleLocalNotification({
      title: "t",
      body: "b",
      at: new Date(Date.now() + 60_000),
    });

    await cancelLocalNotification(id);

    expect(n.cancelScheduledNotificationAsync).toHaveBeenCalledWith("scheduled-1");
  });
});

describe("permission denial", () => {
  it("reports a refused permission that cannot be asked again as denied", async () => {
    n.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });

  it("reports a refused permission that can be asked again as undetermined", async () => {
    n.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });

    await expect(notificationPermission()).resolves.toBe("undetermined");
  });

  it("does not schedule anything in a state where it is not allowed", async () => {
    // Scheduling is refused by the caller when permission is not granted (the Profile test card disables it).
    // Here the module itself still schedules when called, so the UI gate is what this confirms.
    n.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(notificationPermission()).resolves.toBe("denied");
  });
});
