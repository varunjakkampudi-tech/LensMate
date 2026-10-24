import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { readBrokerConfig } from "../src/broker-config";
import { EnrolmentScreen } from "../src/enrolment-screen";
import { Body, Btn, Card, Field, H2, Notice } from "../src/ui/kit";
import { useTheme } from "../src/ui/theme";

/** Preview-only owner helper: the owner's passphrase issues one single-use, 10-minute code on the server. */
function OwnerCode() {
  const url = process.env.EXPO_PUBLIC_OWNER_CODE_URL;
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  if (url === undefined || url === "") {
    return null;
  }
  const issue = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "x-owner-passphrase": pass },
      });
      const body = (await response.json()) as { code?: string };
      setMessage(
        response.ok && body.code !== undefined
          ? {
              tone: "info",
              text: `Code: ${body.code} (single use, valid 10 minutes). Type it below.`,
            }
          : {
              tone: "error",
              text:
                response.status === 429
                  ? "Too many tries. Wait a minute."
                  : "Passphrase not accepted.",
            },
      );
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setPass("");
      setBusy(false);
    }
  };
  return (
    <Card>
      <H2>Owner: get an enrolment code</H2>
      <Body muted size={14}>
        Only the owner knows the passphrase. Each code enrols one phone once.
      </Body>
      <Field
        testID="owner-passphrase-input"
        label="Owner passphrase"
        value={pass}
        onChange={setPass}
        secure
      />
      <Btn
        testID="owner-code-button"
        label="Get a code"
        icon="shield"
        busy={busy}
        disabled={pass.length < 12}
        onPress={() => void issue()}
      />
      {message === null ? null : (
        <Notice testID="owner-code-result" tone={message.tone}>
          {message.text}
        </Notice>
      )}
    </Card>
  );
}

export default function EnrolRoute() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 20, maxWidth: 1080, width: "100%", alignSelf: "center" }}>
        <OwnerCode />
      </View>
      <View
        style={{
          flex: 1,
          backgroundColor: "#F6F4EF",
          maxWidth: 1080,
          width: "100%",
          alignSelf: "center",
          borderRadius: 20,
        }}
      >
        <EnrolmentScreen
          config={readBrokerConfig()}
          onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      </View>
    </View>
  );
}
