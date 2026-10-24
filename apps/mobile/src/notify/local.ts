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

/** How a notification is shown while LensMate is open: a banner and list entry, no sound or badge. */
export function foregroundPresentation() {
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => foregroundPresentation(),
});

/** Only in-app paths are accepted from a notification: "/memory" yes, "https://..." or "//host" no. */
export function isSafeInAppRoute(route: unknown): route is string {
  return typeof route === "string" && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(route);
}

/**
 * Identifiers of tapped notifications already routed. A tap can reach the app twice (once as the initial response when
 * the app is opened from a notification, and again from the live listener); each is routed only once.
 */
const routedIds = new Set<string>();

/** Returns the route of a tapped notification the first time it is seen, and undefined after that or if unsafe. */
function routeOnce(response: Notifications.NotificationResponse): string | undefined {
  const id = response.notification.request.identifier;
  if (routedIds.has(id)) {
    return undefined;
  }
  routedIds.add(id);
  const route: unknown = response.notification.request.content.data?.route;
  return isSafeInAppRoute(route) ? route : undefined;
}

/**
 * The notification that opened the app from a closed state, if any, as an in-app route. Each notification is returned
 * once. Call it on launch, then listen with onNotificationTap for taps while the app is running.
 */
export async function initialNotificationRoute(): Promise<string | undefined> {
  if (Platform.OS === "web") {
    return undefined;
  }
  const response = await Notifications.getLastNotificationResponseAsync();
  return response === null ? undefined : routeOnce(response);
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
    const route = routeOnce(response);
    if (route !== undefined) {
      handler(route);
    }
  });
  return () => sub.remove();
}
