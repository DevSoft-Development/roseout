import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import OFFICIAL_LOGO from "../../assets/toh_logo_wordmark_white.webp";

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="TheOutHaven home"
      onPress={() => router.replace("/")}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={styles.brandLockup}>
        <Image source={OFFICIAL_LOGO} style={compact ? styles.logoCompact : styles.logo} resizeMode="contain" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", alignSelf: "flex-start", flexShrink: 1 },
  brandLockup: { alignItems: "center", flexShrink: 1 },
  logo: { width: 204, height: 68, flexShrink: 0 },
  logoCompact: { width: 164, height: 55, flexShrink: 0 },
});
