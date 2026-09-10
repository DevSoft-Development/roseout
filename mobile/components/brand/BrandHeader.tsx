import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

const OFFICIAL_LOGO_URI = "https://theouthaven.com/toh_logo.png";

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="TheOutHaven home"
      onPress={() => router.replace("/")}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={[styles.logoShell, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }]}> 
        <Image source={{ uri: OFFICIAL_LOGO_URI }} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.wordmark}>
        <AppText variant={compact ? "bodyStrong" : "h3"}>TheOutHaven</AppText>
        {!compact ? <AppText variant="caption" muted>Plan better OUTings.</AppText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start" },
  logoShell: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  logo: { width: 34, height: 34 },
  wordmark: { gap: 1 },
});
