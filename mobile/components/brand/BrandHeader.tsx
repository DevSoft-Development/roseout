import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import OFFICIAL_LOGO from "../../assets/logo.png";

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
  logo: { width: 196, height: 65, flexShrink: 0 },
  logoCompact: { width: 158, height: 53, flexShrink: 0 },
});
