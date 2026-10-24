import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Btn, Card, H2 } from "../ui/kit";
import { FONTS, useTheme } from "../ui/theme";
import { REGISTRY, MATRIX_COMMIT, MATRIX_DATE } from "./registry";
import {
  completionPercent,
  evidenceLevels,
  REGISTRY_POLICY_VERSION,
  stateOf,
  type ReadinessEntry,
  type ReadinessState,
} from "./model";

type Filter = "p1" | "features" | "checklist" | "future" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "p1", label: "P-1 scope" },
  { id: "features", label: "Features" },
  { id: "checklist", label: "Checklist" },
  { id: "future", label: "Future" },
  { id: "all", label: "All" },
];

const PAGE = 8;

export function inFilter(entry: ReadinessEntry, filter: Filter): boolean {
  switch (filter) {
    case "p1":
      return entry.p1Scope;
    case "features":
      return entry.kind === "features" && entry.status !== "NOT_DUE";
    case "checklist":
      return entry.kind === "checklist";
    case "future":
      return entry.status === "NOT_DUE";
    case "all":
      return true;
  }
}

/** Counts by state for the entries in a filter. Future rows are counted only in the Future bucket. */
export function summarise(entries: readonly ReadinessEntry[]): Record<ReadinessState, number> {
  const counts: Record<ReadinessState, number> = {
    Ready: 0,
    Partial: 0,
    "Not started": 0,
    Blocked: 0,
    Future: 0,
  };
  for (const e of entries) {
    counts[stateOf(e)] += 1;
  }
  return counts;
}

/**
 * Product readiness: every matrix row, grouped by filter, with state, completion and validation evidence. Collapsed on the
 * home screen by default. Nothing here marks a feature Ready without owner device evidence (see model.ts).
 */
export function ReadinessSection() {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("p1");
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const p1 = useMemo(() => REGISTRY.filter((e) => e.p1Scope), []);
  const summary = useMemo(() => summarise(p1), [p1]);
  const visible = useMemo(() => REGISTRY.filter((e) => inFilter(e, filter)), [filter]);
  const shown = visible.slice(0, limit);

  const stateColor = (s: ReadinessState) =>
    s === "Ready" ? c.ok : s === "Partial" ? c.accent2 : s === "Blocked" ? c.danger : c.muted;

  return (
    <Card testID="readiness-section">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Product readiness, ${summary.Ready} ready of ${p1.length} P-1 features`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ gap: 6 }}
      >
        <H2>Product readiness</H2>
        <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 13 }}>
          {p1.length} phase-1 items · {summary.Ready} ready · {summary.Partial} partial ·{" "}
          {summary.Blocked} blocked
        </Text>
        <Text style={{ color: c.accent, fontFamily: FONTS.body, fontSize: 13, fontWeight: "600" }}>
          {open ? "Hide" : "Show all features"}
        </Text>
      </Pressable>

      {open ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text
            testID="readiness-policy"
            style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 }}
          >
            No feature is Ready yet: the matrix records no owner-run device evidence. Percentages
            are implementation estimates (policy v{REGISTRY_POLICY_VERSION}), not measurements.
            Matrix {MATRIX_DATE} · commit {MATRIX_COMMIT}.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.id}
                testID={`readiness-filter-${f.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Show ${f.label}`}
                accessibilityState={{ selected: filter === f.id }}
                onPress={() => {
                  setFilter(f.id);
                  setLimit(PAGE);
                  setExpanded(null);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  minHeight: 36,
                  borderRadius: 999,
                  backgroundColor: filter === f.id ? c.accent : c.surface2,
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: filter === f.id ? c.accentInk : c.text,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12 }}>
            Showing {shown.length} of {visible.length}
          </Text>

          {shown.map((e) => {
            const state = stateOf(e);
            const pct = completionPercent(e);
            const isOpen = expanded === e.id;
            return (
              <Pressable
                key={e.id}
                testID={`readiness-item-${e.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${e.name}, ${state}${pct === null ? "" : `, ${pct} percent`}`}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setExpanded(isOpen ? null : e.id)}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                  paddingTop: 10,
                  gap: 6,
                  minHeight: 44,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text
                    numberOfLines={isOpen ? undefined : 2}
                    style={{
                      flex: 1,
                      color: c.text,
                      fontFamily: FONTS.body,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {e.name}
                  </Text>
                  <Text
                    style={{
                      color: stateColor(state),
                      fontFamily: FONTS.body,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {state}
                  </Text>
                </View>
                <Text style={{ color: c.muted, fontFamily: FONTS.body, fontSize: 12 }}>
                  {e.id} · {e.phase}
                  {pct === null ? "" : ` · ${pct}% implemented`}
                </Text>
                {isOpen ? (
                  <View style={{ gap: 4 }}>
                    <Detail label="Validation" value={evidenceLevels(e).join(", ")} />
                    <Detail label="Matrix status" value={e.status} />
                    <Detail label="Evidence" value={e.evidence} />
                    <Detail label="Remaining work" value={e.remaining} />
                    <Detail label="Blocker or owner" value={e.blocker} />
                    <Detail label="Recorded" value={`${MATRIX_DATE} · commit ${MATRIX_COMMIT}`} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          {visible.length > shown.length ? (
            <Btn
              testID="readiness-more"
              label={`Show ${Math.min(PAGE, visible.length - shown.length)} more`}
              tone="ghost"
              onPress={() => setLimit(limit + PAGE)}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <Text style={{ color: c.text, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 }}>
      <Text style={{ color: c.muted, fontWeight: "600" }}>{label}: </Text>
      {value}
    </Text>
  );
}
