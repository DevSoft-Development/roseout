import { Image, Pressable, StyleSheet, Text, View } from "react-native";
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
      <View style={styles.brandLockup}>
        <View style={compact ? styles.logoMaskCompact : styles.logoMask}>
          <Image source={{ uri: OFFICIAL_LOGO_URI }} style={compact ? styles.logoCompact : styles.logo} resizeMode="contain" />
        </View>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[styles.tagline, compact && styles.taglineCompact]}
        >
          ACTIVITIES • ENTERTAINMENT • EXPERIENCES • RESTAURANTS
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", alignSelf: "flex-start", flexShrink: 1 },
  brandLockup: { alignItems: "center", flexShrink: 1 },
  logoMask: { width: 180, height: 20, overflow: "hidden" },
  logoMaskCompact: { width: 148, height: 16, overflow: "hidden" },
  logo: { width: 180, height: 24, flexShrink: 0 },
  logoCompact: { width: 148, height: 20, flexShrink: 0 },
  tagline: {
    width: 205,
    marginTop: 2,
    color: "rgba(255,255,255,0.82)",
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.35,
    textAlign: "center",
  },
  taglineCompact: { width: 168, fontSize: 5.2, letterSpacing: 0.25 },
});
