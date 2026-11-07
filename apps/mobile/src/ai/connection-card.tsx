import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { readBrokerConfig } from "../broker-config";
import { Btn, Card, H2, Body } from "../ui/kit";
import { FONTS, useTheme } from "../ui/theme";
import { latencyLog, type LatencyRecord } from "./assistant";
import { useAiSetup } from "./use-ai-setup";
import {
  checkBrokerReachable,
  describeAiConnection,
  type ConnectionRow,
  type Tri,
} from "./connection";

/**
 * AI connection panel (Profile). Each state is shown on its own. "Not checked" means the app did not measure it.
 * The reachability check sends no credentials and calls no AI route.
 */
export function AiConnectionCard() {
  const { c } = useTheme();
  const setup = useAiSetup();
  const config = readBrokerConfig();
  const [reachable, setReachable] = useState<Tri>("not checked");
  const [checking, setChecking] = useState(false);
  const [last, setLast] = useState<LatencyRecord | null>(null);

  useEffect(() => {
    setLast(latencyLog()[0] ?? null);
  }, []);

  const rows: ConnectionRow[] = describeAiConnection({
    endpointConfigured: config.ok,
    enrolled: setup.enrolled,
    disclosureAccepted: setup.accepted,
    reachable,
    lastAnswerSource: null,
    lastRequest:
      last === null ? null : { ok: last.ok, route: last.route, latencyMs: last.latencyMs },
    lastError:
      last === null || last.ok
        ? null
        : "The last request failed. Check the connection, then try again.",
    spentPaise: setup.spentPaise,
    capPaise: setup.capPaise,
  });

  const check = () => {
    if (!config.ok) {
      setReachable("no");
      return;
    }
    setChecking(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    void checkBrokerReachable(config.baseUrl, fetch, controller.signal)
      .then((r) => setReachable(r))
      .finally(() => {
        clearTimeout(timer);
        setChecking(false);
      });
  };

  const toneColor = (t: ConnectionRow["tone"]) =>
    t === "ok" ? c.ok : t === "warn" ? c.accent2 : t === "error" ? c.danger : c.muted;

  return (
    <Card>
      <H2>AI connection</H2>
      <Body muted size={13}>
        Each line is checked separately. "Not checked" means this phone has not measured it.
      </Body>
      {rows.map((r) => (
        <View
          key={r.id}
          testID={`ai-row-${r.id}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 14, flexShrink: 1 }}>
            {r.label}
          </Text>
          <Text
            style={{
              color: toneColor(r.tone),
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: "600",
              textAlign: "right",
              flexShrink: 1,
            }}
          >
            {r.value}
          </Text>
        </View>
      ))}
      <Btn
        testID="ai-check-reachable"
        label={checking ? "Checking…" : "Check broker reachability"}
        tone="ghost"
        disabled={checking}
        onPress={check}
      />
      <Body muted size={12}>
        Uses no AI and sends no credential. OpenRouter is never contacted from the phone.
      </Body>
    </Card>
  );
}
