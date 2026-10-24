import { ScrollView } from "react-native";
import { Chip } from "./kit";
import { LANGS, type Lang } from "./prefs";

/** Horizontal language chips (native names), used by Talk, Translate and Profile. */
export function LangPicker({
  value,
  onChange,
  prefix,
}: {
  value: Lang;
  onChange: (l: Lang) => void;
  prefix: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {(Object.keys(LANGS) as Lang[]).map((l) => (
        <Chip
          key={l}
          testID={`${prefix}-${l}`}
          label={LANGS[l].native}
          active={value === l}
          onPress={() => onChange(l)}
        />
      ))}
    </ScrollView>
  );
}
