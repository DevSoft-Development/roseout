import { Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

const OFFICIAL_LOGO_URI = "https://theouthaven.com/toh_logo_wordmark_dark.png";

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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", alignSelf: "flex-start", flexShrink: 1 },
  logo: { width: 180, height: 55, flexShrink: 0 },
  logoCompact: { width: 148, height: 45, flexShrink: 0 },
});
