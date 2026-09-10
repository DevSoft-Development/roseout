import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { registerForOutingReminders } from "@/lib/notifications";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/providers/ThemeProvider";

export default function ProfileScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { loading, user, guestId, signOut } = useAuth();
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const enableReminders = async () => {
    if (!user) return router.push("/auth");
    setEnablingPush(true);
    try {
      const result = await registerForOutingReminders();
      if (result.ok) {
        setPushEnabled(true);
        Alert.alert("OUTing reminders are on", "We’ll use push notifications for important OUTing timing and reservation updates.");
      } else if (result.reason === "permission_denied") {
        Alert.alert("Notifications are off", "Enable notifications for TheOutHaven in your device settings to receive OUTing reminders.");
      } else if (result.reason === "missing_project_id") {
        Alert.alert("Push setup isn’t finished", "This build is missing its EAS project identity. Push will be available in the configured beta build.");
      } else {
        Alert.alert("Push unavailable", "Push notifications require a supported physical device and development or release build.");
      }
    } catch {
      Alert.alert("Couldn’t enable reminders", "TheOutHaven couldn’t register this device for push notifications yet.");
    } finally {
      setEnablingPush(false);
    }
  };

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <BrandHeader />
      <View style={styles.hero}>
        <AppText variant="eyebrow" accent>YOUR THEOUTHAVEN</AppText>
        <AppText variant="h1">Everything you save, in one place.</AppText>
        <AppText muted>Keep OUTings synced, get reminders, and move between web and mobile without losing your plans.</AppText>
      </View>

      <Card elevated style={styles.accountCard}>
        {loading ? (
          <View style={styles.stack}>
            <AppText variant="eyebrow" accent>ACCOUNT</AppText>
            <AppText variant="h3">Restoring your session…</AppText>
          </View>
        ) : user ? (
          <View style={styles.stack}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent }]}> 
              <AppText variant="h2" accent>{(user.email || "T").slice(0, 1).toUpperCase()}</AppText>
            </View>
            <View style={{ gap: 4 }}>
              <AppText variant="eyebrow" accent>MEMBER</AppText>
              <AppText variant="h3">Signed in</AppText>
              <AppText muted>{user.email || "TheOutHaven member"}</AppText>
            </View>
            <Button variant="secondary" onPress={() => void signOut()}>Sign Out</Button>
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent }]}> 
              <AppText variant="h2" accent>✦</AppText>
            </View>
            <View style={{ gap: 5 }}>
              <AppText variant="eyebrow" accent>GUEST MODE</AppText>
              <AppText variant="h2">Ready when you are.</AppText>
              <AppText muted>You can explore without an account. Sign in to save OUTings, sync across devices, receive reminders, and leave reviews.</AppText>
            </View>
            {guestId ? <AppText variant="caption" muted>Guest session {guestId.slice(-8)}</AppText> : null}
            <Button onPress={() => router.push("/auth")}>Sign In or Create Account</Button>
          </View>
        )}
      </Card>

      {user ? (
        <Card elevated>
          <View style={styles.stack}>
            <AppText variant="eyebrow" accent>OUTING REMINDERS</AppText>
            <AppText variant="h3">Stay ahead of the plan.</AppText>
            <AppText muted>Get important timing, reservation, and upcoming OUTing notifications on this device. Marketing notifications remain off by default.</AppText>
            <Button disabled={enablingPush || pushEnabled} onPress={enableReminders}>
              {pushEnabled ? "Reminders enabled" : enablingPush ? "Enabling…" : "Enable reminders"}
            </Button>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingTop: 24, paddingBottom: 118, gap: 24 },
  hero: { gap: 8, paddingTop: 10 },
  accountCard: { marginTop: 4 },
  stack: { gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
