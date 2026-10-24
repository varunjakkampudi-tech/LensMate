import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Body, Btn, Card, H2, Notice } from "../ui/kit";
import {
  cancelLocalNotification,
  notificationPermission,
  requestNotificationPermission,
  scheduleLocalNotification,
  type NotifyPermission,
} from "./local";

/**
 * Test control for local notifications (Profile). It sends one test notification in 10 seconds, so the owner can check
 * the permission prompt, the banner, and the tap-through to Memory on a real phone. It does not schedule anything else.
 */
export function NotificationTestCard() {
  const [status, setStatus] = useState<NotifyPermission>("undetermined");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void notificationPermission().then(setStatus);
  }, []);

  if (Platform.OS === "web") {
    return (
      <Card>
        <H2>Notification test</H2>
        <Notice tone="info">
          Phone notifications are not available in the browser. Reminders still appear while
          LensMate is open.
        </Notice>
      </Card>
    );
  }

  return (
    <Card>
      <H2>Notification test</H2>
      <Body muted size={14}>
        Permission: {status}. Sends one test notification in 10 seconds. Whether it arrives with
        LensMate closed is a device test (not verified here). Tapping it opens Memory.
      </Body>
      {status === "granted" ? null : (
        <Btn
          testID="notify-allow"
          label="Allow notifications"
          tone="ghost"
          icon="bell"
          onPress={() =>
            void requestNotificationPermission().then((s) => {
              setStatus(s);
              setMessage(
                s === "granted"
                  ? null
                  : "Notifications are off. Turn them on in the phone's Settings.",
              );
            })
          }
        />
      )}
      <Btn
        testID="notify-send-test"
        label="Send test in 10 seconds"
        icon="bell"
        disabled={status !== "granted" || pending !== null}
        onPress={() =>
          void scheduleLocalNotification({
            title: "LensMate test",
            body: "This is a test notification. Tap to open Memory.",
            at: new Date(Date.now() + 10_000),
            route: "/memory",
          })
            .then((id) => {
              setPending(id);
              setMessage("Scheduled. Lock the phone or switch apps to see it arrive.");
            })
            .catch(() => setMessage("The test could not be scheduled. Try again."))
        }
      />
      {pending === null ? null : (
        <Btn
          testID="notify-cancel-test"
          label="Cancel the test"
          tone="ghost"
          onPress={() =>
            void cancelLocalNotification(pending).then(() => {
              setPending(null);
              setMessage("Test cancelled.");
            })
          }
        />
      )}
      {message === null ? null : <Notice tone="info">{message}</Notice>}
    </Card>
  );
}
