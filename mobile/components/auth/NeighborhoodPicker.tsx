import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { mobileApi } from "@/lib/api";
import { useAppTheme } from "@/providers/ThemeProvider";

export type NeighborhoodOption = {
  key: string;
  neighborhood: string;
  borough: string | null;
  city: string | null;
  state: string | null;
  label: string;
};

type NeighborhoodResponse = {
  ok: true;
  neighborhoods: NeighborhoodOption[];
};

export function NeighborhoodPicker({
  value,
  onChange,
}: {
  value: NeighborhoodOption | null;
  onChange: (value: NeighborhoodOption | null) => void;
}) {
  const { theme } = useAppTheme();
  const [query, setQuery] = useState(value?.label || "");
  const [options, setOptions] = useState<NeighborhoodOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value?.label && query !== value.label) setQuery(value.label);
  }, [value?.key]);

  useEffect(() => {
    const trimmed = query.trim();
    if (value?.label === query || trimmed.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void mobileApi<NeighborhoodResponse>(`/neighborhoods?q=${encodeURIComponent(trimmed)}`)
        .then((result) => {
          if (active) setOptions(result.neighborhoods || []);
        })
        .catch(() => {
          if (active) setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, value?.label]);

  const edit = (next: string) => {
    setQuery(next.slice(0, 120));
    if (value) onChange(null);
  };

  const choose = (option: NeighborhoodOption) => {
    setQuery(option.label);
    setOptions([]);
    onChange(option);
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        autoCapitalize="words"
        autoCorrect={false}
        placeholder="Start typing your neighborhood"
        placeholderTextColor={theme.colors.textMuted}
        value={query}
        onChangeText={edit}
        style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: value ? theme.colors.accent : theme.colors.borderStrong, color: theme.colors.text }]}
        accessibilityLabel="Home neighborhood"
      />
      {loading ? <AppText variant="caption" muted>Finding neighborhoods…</AppText> : null}
      {!loading && query.trim().length >= 2 && !value && options.length === 0 ? (
        <AppText variant="caption" muted>Keep typing to find a neighborhood in TheOutHaven.</AppText>
      ) : null}
      {options.length > 0 ? (
        <View style={[styles.results, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.borderStrong }]}>
          {options.map((option, index) => (
            <Pressable
              key={option.key}
              onPress={() => choose(option)}
              style={[styles.row, index > 0 && { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.rowCopy}>
                <AppText variant="bodyStrong">{option.neighborhood}</AppText>
                <AppText variant="caption" muted>{[option.borough, option.city && option.city !== option.borough ? option.city : null, option.state].filter(Boolean).join(", ")}</AppText>
              </View>
              <AppText accent>›</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {value ? <AppText variant="caption" accent>✓ Connected to {value.label}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, fontWeight: "600" },
  results: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  row: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowCopy: { flex: 1, gap: 3 },
});
