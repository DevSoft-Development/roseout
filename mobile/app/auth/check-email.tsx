import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { useAppTheme } from "@/providers/ThemeProvider";

export default function CheckEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top + 18, 30), paddingBottom: Math.max(insets.bottom + 24, 40) }]}>
      <BrandHeader compact />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
        <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
          <AppText accent style={styles.iconText}>✓</AppText>
        </View>
        <AppText variant="eyebrow" accent>ACCOUNT CREATED</AppText>
        <AppText variant="h1" style={styles.center}>Check your email to verify your account.</AppText>
        {email ? <AppText muted style={styles.center}>We sent a verification link to {email}.</AppText> : null}
        <AppText muted style={styles.center}>Open the verification link, then return to TheOutHaven and sign in.</AppText>
        <Button onPress={() => router.replace({ pathname: "/auth", params: { mode: "signin" } })}>Back to sign in</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 22, gap: 24 },
  card: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 14, alignItems: "center" },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 22, fontWeight: "800" },
  center: { textAlign: "center" },
});
