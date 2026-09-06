import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  onPress: () => void;
};

export function DiscoveryCard({ eyebrow, title, description, onPress }: Props) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.copy}>
        {eyebrow ? <AppText variant="eyebrow" accent>{eyebrow}</AppText> : null}
        <AppText variant="h3">{title}</AppText>
        {description ? <AppText muted>{description}</AppText> : null}
      </View>
      <AppText variant="h2" accent>›</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  copy: {
    flex: 1,
    gap: 5,
  },
});
