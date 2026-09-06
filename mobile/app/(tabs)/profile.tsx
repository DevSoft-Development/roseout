import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
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
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <AppText variant="eyebrow" accent>PROFILE</AppText>
        <AppText variant="h1">Your TheOutHaven</AppText>
        <AppText muted>Manage the consumer account that follows you across web and mobile.</AppText>

        <Card>
          {loading ? (
            <AppText muted>Restoring your session...</AppText>
          ) : user ? (
            <View style={styles.stack}>
              <AppText variant="h3">Signed in</AppText>
              <AppText muted>{user.email || "TheOutHaven member"}</AppText>
              <Button variant="secondary" onPress={() => void signOut()}>Sign Out</Button>
            </View>
          ) : (
            <View style={styles.stack}>
              <AppText variant="h3">Guest mode</AppText>
              <AppText muted>You can search and explore without an account. Sign in when you want to save, sync, receive reminders, or review.</AppText>
              {guestId ? <AppText variant="caption" muted>Guest session {guestId.slice(-8)}</AppText> : null}
              <Button onPress={() => router.push("/auth")}>Sign In or Create Account</Button>
            </View>
          )}
        </Card>

        {user ? (
          <Card>
            <View style={styles.stack}>
              <AppText variant="h3">OUTing reminders</AppText>
              <AppText muted>Get important timing, reservation, and upcoming OUTing notifications on this device. Marketing notifications remain off by default.</AppText>
              <Button disabled={enablingPush || pushEnabled} onPress={enableReminders}>
                {pushEnabled ? "Reminders enabled" : enablingPush ? "Enabling..." : "Enable reminders"}
              </Button>
            </View>
          </Card>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, gap: 12, paddingHorizontal: 20, paddingTop: 72 },
  stack: { gap: 12 },
});
