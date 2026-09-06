import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/providers/ThemeProvider";

export default function ProfileScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { loading, user, guestId, signOut } = useAuth();

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, gap: 12, paddingHorizontal: 20, paddingTop: 72 },
  stack: { gap: 12 },
});
