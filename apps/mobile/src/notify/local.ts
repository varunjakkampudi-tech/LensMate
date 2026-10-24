import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Local notifications on the phone (Expo Go and development builds, via expo-notifications). They are scheduled on the
 * device, so they fire without the app running. Remote push is a separate feature and is not used here.
 *
 * Time: the trigger is an absolute instant. The operating system shows it at the matching local time, so scheduling
 * stays correct across time zones and daylight-saving changes.
 *
 * Tap: a notification may open only an in-app path (starting with a single "/"). Anything else is ignored.
 */
export type NotifyPermission = "granted" | "denied" | "undetermined" | "unsupported";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Only in-app paths are accepted from a notification: "/memory" yes, "https://..." or "//host" no. */
export function isSafeInAppRoute(route: unknown): route is string {
  return typeof route === "string" && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(route);
}

export function mapPermission(status: {
  granted: boolean;
  canAskAgain?: boolean;
}): Exclude<NotifyPermission, "unsupported"> {
  if (status.granted) {
    return "granted";
  }
  return status.canAskAgain === false ? "denied" : "undetermined";
}

export async function notificationPermission(): Promise<NotifyPermission> {
  if (Platform.OS === "web") {
    return "unsupported";
  }
  return mapPermission(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (Platform.OS === "web") {
    return "unsupported";
  }
  return mapPermission(await Notifications.requestPermissionsAsync());
}

export async function scheduleLocalNotification(input: {
  title: string;
  body: string;
  at: Date;
  route?: string;
}): Promise<string> {
  if (input.at.getTime() <= Date.now()) {
    throw new Error("NOTIFICATION_TIME_PASSED");
  }
  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title.slice(0, 80),
      body: input.body.slice(0, 200),
      data: { route: isSafeInAppRoute(input.route) ? input.route : "/" },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.at },
  });
}

export async function cancelLocalNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/** Calls handler with the in-app route of a tapped notification. Returns a function that stops listening. */
export function onNotificationTap(handler: (route: string) => void): () => void {
  if (Platform.OS === "web") {
    return () => undefined;
  }
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const route: unknown = response.notification.request.content.data?.route;
    if (isSafeInAppRoute(route)) {
      handler(route);
    }
  });
  return () => sub.remove();
}
