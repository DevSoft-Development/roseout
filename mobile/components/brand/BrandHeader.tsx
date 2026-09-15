import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";

const OFFICIAL_LOGO_URI = "https://theouthaven.com/toh_logo.png";

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="TheOutHaven home"
      onPress={() => router.replace("/")}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}
    >
      <Image source={{ uri: OFFICIAL_LOGO_URI }} style={compact ? styles.logoCompact : styles.logo} resizeMode="contain" />
      <View style={styles.wordmark}>
        <AppText variant={compact ? "bodyStrong" : "h3"}>TheOutHaven</AppText>
        {!compact ? <AppText variant="caption" muted>Plan better OUTings.</AppText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", flexShrink: 1 },
  logo: { width: 40, height: 40, flexShrink: 0 },
  logoCompact: { width: 36, height: 36, flexShrink: 0 },
  wordmark: { gap: 1, flexShrink: 1 },
});
