import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Btn, Notice } from "../ui/kit";
import { type HeadDocument, ensureWebAppHead } from "./web-head";
import { applyUpdate, browserEnv, registerAppShell } from "./service-worker";

/** Browser connectivity. Native builds are treated as online here: their offline state is not read in this file. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => Platform.OS !== "web" || navigator.onLine !== false);
  useEffect(() => {
    if (Platform.OS !== "web") {
      return undefined;
    }
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/**
 * Offline and update notices for the web app. Shows nothing while online and up to date. An update is never applied
 * automatically: the user taps Update.
 */
export function PwaStatus() {
  const online = useOnline();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    ensureWebAppHead(document as unknown as HeadDocument);
    registerAppShell(browserEnv(), () => setUpdateReady(true))
      .then(setRegistration)
      .catch(() => undefined);
  }, []);

  if (online && !updateReady) {
    return null;
  }
  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingTop: 8 }} accessibilityLiveRegion="polite">
      {online ? null : (
        <Notice tone="warn" testID="offline-notice">
          You are offline. Notes and captures stay on this device. Cloud answers and speech need a
          connection.
        </Notice>
      )}
      {updateReady && registration !== undefined ? (
        <View testID="update-notice" style={{ gap: 8 }}>
          <Notice tone="info">A new version of LensMate is ready.</Notice>
          <Btn
            testID="update-button"
            label="Update now"
            icon="check"
            onPress={() => applyUpdate(registration, () => window.location.reload())}
          />
        </View>
      ) : null}
    </View>
  );
}
