import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { mobileApi } from "@/lib/api";
import { mobileConfig } from "@/lib/config";
import { registerForOutingReminders } from "@/lib/notifications";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/providers/ThemeProvider";

type MePayload = {
  ok: true;
  profile: {
    kind: "user" | "guest";
    firstName: string | null;
    email: string | null;
    phone: string | null;
    birthMonth: number | null;
    homeNeighborhood: string | null;
    homeBorough: string | null;
    homeCity: string | null;
    homeState: string | null;
    smsConsent: boolean;
  };
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function ProfileScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { loading, user, signOut } = useAuth();
  const [profile, setProfile] = useState<MePayload["profile"] | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) { setProfile(null); return; }
    void mobileApi<MePayload>("/me").then((result) => setProfile(result.profile)).catch(() => undefined);
  }, [user?.id]));

  const enableReminders = async () => {
    if (!user) return router.push({ pathname: "/auth", params: { mode: "signin" } });
    setEnablingPush(true);
    try {
      const result = await registerForOutingReminders();
      if (result.ok) {
        setPushEnabled(true);
        Alert.alert("OUTing reminders are on", "We’ll use push notifications for important OUTing timing and reservation updates.");
      } else if (result.reason === "permission_denied") {
        Alert.alert("Notifications are off", "Enable notifications for TheOutHaven in your device settings to receive OUTing reminders.");
      } else {
        Alert.alert("Push unavailable", "Push notifications require a supported physical device and configured app build.");
      }
    } catch {
      Alert.alert("Couldn’t enable reminders", "TheOutHaven couldn’t register this device for push notifications yet.");
    } finally {
      setEnablingPush(false);
    }
  };

  const displayEmail = user?.email || profile?.email || "TheOutHaven member";
  const displayName = profile?.firstName || displayEmail;
  const initials = displayName.slice(0, 1).toUpperCase();
  const neighborhoodLabel = profile?.homeNeighborhood
    ? [
        profile.homeNeighborhood,
        profile.homeBorough,
        profile.homeCity && profile.homeCity !== profile.homeBorough ? profile.homeCity : null,
        profile.homeState,
      ].filter(Boolean).join(", ")
    : "Not set";

  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]} showsVerticalScrollIndicator={false}>
      <BrandHeader compact />

      <View style={styles.heading}>
        <AppText variant="eyebrow" accent>PROFILE</AppText>
        <AppText variant="h1">{user ? "Your TheOutHaven" : "Make it yours."}</AppText>
        <AppText muted style={styles.copy}>{user ? "Your account, preferences, reminders, and saved life in one place." : "Sign in when you’re ready to save places, keep OUTings synced, and get timely reminders."}</AppText>
      </View>

      {loading ? <Card elevated><AppText muted>Restoring your account…</AppText></Card> : user ? (
        <Card elevated>
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}><AppText variant="h2" accent>{initials}</AppText></View>
            <View style={{ flex: 1 }}>
              <AppText variant="eyebrow" accent>MEMBER</AppText>
              <AppText variant="h3" style={{ marginTop: 3 }}>{displayName}</AppText>
              {profile?.firstName ? <AppText variant="caption" muted style={{ marginTop: 4 }}>{displayEmail}</AppText> : null}
              {profile?.phone ? <AppText variant="caption" muted style={{ marginTop: 4 }}>{profile.phone}</AppText> : null}
            </View>
          </View>
          <View style={[styles.profileMeta, { borderTopColor: theme.colors.border }]}>
            <Meta label="Home neighborhood" value={neighborhoodLabel} accent={Boolean(profile?.homeNeighborhood)} wide />
            <Meta label="Birth month" value={profile?.birthMonth ? MONTHS[profile.birthMonth - 1] : "Not set"} />
            <Meta label="SMS updates" value={profile?.smsConsent ? "On" : "Off"} accent={Boolean(profile?.smsConsent)} />
          </View>
        </Card>
      ) : (
        <Card elevated>
          <AppText variant="eyebrow" accent>GUEST</AppText>
          <AppText variant="h2" style={{ marginTop: 8 }}>Explore now. Save it when it matters.</AppText>
          <AppText muted style={styles.cardCopy}>Create one account for your saved places, OUTings, favorites, reminders, and reviews across web and mobile.</AppText>
          <View style={styles.authActions}>
            <Button onPress={() => router.push({ pathname: "/auth", params: { mode: "signin" } })}>Sign in</Button>
            <Button variant="secondary" onPress={() => router.push({ pathname: "/auth", params: { mode: "signup" } })}>Create account</Button>
          </View>
        </Card>
      )}

      <View style={styles.section}>
        <AppText variant="eyebrow" muted>YOUR THEOUTHAVEN</AppText>
        <View style={[styles.menu, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}> 
          <MenuRow title="My OUTings" subtitle="Upcoming, saved, past, and favorite places" icon="⌁" onPress={() => router.push("/(tabs)/outings")} />
          <Divider />
          <MenuRow title="Discover" subtitle="Find your next place or plan" icon="✦" onPress={() => router.push("/(tabs)/explore")} />
          {user ? <><Divider /><MenuRow title="OUTing reminders" subtitle={pushEnabled ? "Push reminders are enabled" : "Timing and reservation updates"} icon="◷" onPress={() => void enableReminders()} disabled={enablingPush || pushEnabled} /></> : null}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="eyebrow" muted>HELP & PRIVACY</AppText>
        <View style={[styles.menu, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}> 
          <MenuRow title="Help & support" subtitle="Questions or account help" icon="?" onPress={() => Linking.openURL(`${mobileConfig.siteUrl}/support`)} />
          <Divider />
          <MenuRow title="Privacy" subtitle="How TheOutHaven handles your information" icon="◇" onPress={() => Linking.openURL(`${mobileConfig.siteUrl}/privacy`)} />
          <Divider />
          <MenuRow title="Terms" subtitle="TheOutHaven terms of use" icon="≡" onPress={() => Linking.openURL(`${mobileConfig.siteUrl}/terms`)} />
        </View>
      </View>

      {user ? <View style={styles.signOut}><Button variant="ghost" onPress={() => void signOut()}>Sign out</Button></View> : null}
      <AppText variant="caption" muted style={styles.footer}>TheOutHaven · Plan better OUTings.</AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ label, value, accent = false, wide = false }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  return <View style={[styles.meta, wide && styles.metaWide]}><AppText variant="caption" muted>{label}</AppText><AppText variant="bodyStrong" accent={accent}>{value}</AppText></View>;
}

function MenuRow({ title, subtitle, icon, onPress, disabled = false }: { title: string; subtitle: string; icon: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useAppTheme();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.menuRow, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
      <View style={[styles.menuIcon, { backgroundColor: theme.colors.accentSoft }]}><AppText variant="bodyStrong" accent>{icon}</AppText></View>
      <View style={{ flex: 1 }}><AppText variant="bodyStrong">{title}</AppText><AppText variant="caption" muted style={{ marginTop: 3 }}>{subtitle}</AppText></View>
      <AppText muted style={styles.chevron}>›</AppText>
    </Pressable>
  );
}

function Divider() {
  const { theme } = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingTop: 10, paddingBottom: 118, gap: 20 },
  heading: { gap: 8, paddingTop: 8 }, copy: { lineHeight: 22 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 }, avatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  profileMeta: { flexDirection: "row", flexWrap: "wrap", marginTop: 18, paddingTop: 16, borderTopWidth: 1, gap: 18 }, meta: { gap: 3 }, metaWide: { width: "100%" },
  cardCopy: { marginTop: 8, lineHeight: 21 }, authActions: { marginTop: 18, gap: 10 },
  section: { gap: 10 }, menu: { borderWidth: 1, borderRadius: 22, overflow: "hidden" }, menuRow: { minHeight: 72, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  menuIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, chevron: { fontSize: 27, lineHeight: 29 }, divider: { height: StyleSheet.hairlineWidth, marginLeft: 65 },
  signOut: { marginTop: 2 }, footer: { textAlign: "center", paddingTop: 4 },
});