import * as Notifications from "expo-notifications";
import {
  foregroundPresentation,
  initialNotificationRoute,
  isSafeInAppRoute,
  mapPermission,
  onNotificationTap,
  scheduleLocalNotification,
} from "./local";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => "notif-1"),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const mocked = Notifications as unknown as {
  addNotificationResponseReceivedListener: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
};

function response(id: string, route: unknown) {
  return { notification: { request: { identifier: id, content: { data: { route } } } } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("in-app routes from notifications", () => {
  it("accepts only single-slash in-app paths", () => {
    expect(isSafeInAppRoute("/memory")).toBe(true);
    expect(isSafeInAppRoute("/")).toBe(true);
    expect(isSafeInAppRoute("https://example.com")).toBe(false);
    expect(isSafeInAppRoute("//evil.example")).toBe(false);
    expect(isSafeInAppRoute("memory")).toBe(false);
    expect(isSafeInAppRoute(undefined)).toBe(false);
  });

  it("opens the route only when the notification carries a safe one", () => {
    const handler = jest.fn();
    onNotificationTap(handler);
    const listener = mocked.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as (
      r: unknown,
    ) => void;

    listener({ notification: { request: { content: { data: { route: "/memory" } } } } });
    listener({
      notification: { request: { content: { data: { route: "https://evil.example" } } } },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("/memory");
  });
});

describe("permission mapping", () => {
  it("maps granted, asks again, and blocked states", () => {
    expect(mapPermission({ granted: true })).toBe("granted");
    expect(mapPermission({ granted: false, canAskAgain: true })).toBe("undetermined");
    expect(mapPermission({ granted: false, canAskAgain: false })).toBe("denied");
  });
});

describe("scheduling", () => {
  it("schedules at an absolute instant, so the phone's local time is used", async () => {
    const at = new Date(Date.now() + 60_000);

    const id = await scheduleLocalNotification({
      title: "Check the stove",
      body: "Set 10 min ago",
      at,
      route: "/memory",
    });

    expect(id).toBe("notif-1");
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "date", date: at },
        content: expect.objectContaining({ title: "Check the stove", data: { route: "/memory" } }),
      }),
    );
  });

  it("refuses a time that has already passed", async () => {
    await expect(
      scheduleLocalNotification({ title: "Late", body: "", at: new Date(Date.now() - 1000) }),
    ).rejects.toThrow("NOTIFICATION_TIME_PASSED");
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("replaces an unsafe route with the home route", async () => {
    await scheduleLocalNotification({
      title: "x",
      body: "y",
      at: new Date(Date.now() + 60_000),
      route: "https://evil.example",
    });

    expect(mocked.scheduleNotificationAsync.mock.calls.at(-1)?.[0].content.data).toEqual({
      route: "/",
    });
  });
});

describe("cold-start notification taps", () => {
  it("routes the notification that opened the app once", async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValueOnce(response("cold-1", "/memory"));

    await expect(initialNotificationRoute()).resolves.toBe("/memory");
  });

  it("returns undefined on a second read of the same response", async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValue(response("cold-2", "/memory"));

    await expect(initialNotificationRoute()).resolves.toBe("/memory");
    await expect(initialNotificationRoute()).resolves.toBeUndefined();
  });

  it("returns undefined when the app was not opened from a notification", async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValueOnce(null);

    await expect(initialNotificationRoute()).resolves.toBeUndefined();
  });

  it("routes a notification once when the launch read and the live listener both see it", async () => {
    const handler = jest.fn();
    onNotificationTap(handler);
    const listener = mocked.addNotificationResponseReceivedListener.mock.calls.at(-1)?.[0] as (
      r: unknown,
    ) => void;
    const tapped = response("dup-1", "/memory");
    mocked.getLastNotificationResponseAsync.mockResolvedValueOnce(tapped);

    const fromLaunch = await initialNotificationRoute();
    listener(tapped);

    expect(fromLaunch).toBe("/memory");
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an unsafe route from a cold start and does not route it", async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValueOnce(
      response("cold-3", "https://evil.example"),
    );

    await expect(initialNotificationRoute()).resolves.toBeUndefined();
  });
});

describe("foreground presentation", () => {
  it("shows a banner and list entry while LensMate is open, without sound or badge", () => {
    expect(foregroundPresentation()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});
