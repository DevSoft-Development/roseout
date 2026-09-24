import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const token = typeof params.token === "string" ? params.token : "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const valid = useMemo(
    () => token.length > 0 && password.length >= 8 && password === confirmPassword,
    [token, password, confirmPassword],
  );

  async function updatePassword() {
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${mobileConfig.siteUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || payload.success !== true) {
        setMessage(payload.error || "Password could not be updated.");
        return;
      }
      setComplete(true);
      setMessage("Password updated successfully. You can now sign in with your new password.");
    } catch {
      setMessage("Password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top + 24, 44), paddingBottom: Math.max(insets.bottom + 32, 48) },
        ]}
      >
        <View style={styles.heading}>
          <AppText variant="eyebrow" accent>SECURE PASSWORD RESET</AppText>
          <AppText variant="h1">Create a new password</AppText>
          <AppText muted>Choose a new password, then return to sign in.</AppText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
          {!token ? (
            <View style={[styles.message, { borderColor: theme.colors.borderStrong }]}>
              <AppText variant="bodyStrong">This reset link is invalid or expired.</AppText>
              <AppText variant="caption" muted>Request a new reset email from the app.</AppText>
            </View>
          ) : null}

          {message ? (
            <View style={[styles.message, { borderColor: theme.colors.borderStrong }]}>
              <AppText variant="bodyStrong">{message}</AppText>
            </View>
          ) : null}

          {!complete ? (
            <>
              <AppText variant="label">New password</AppText>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                secureTextEntry
                placeholder="At least 8 characters"
                placeholderTextColor={theme.colors.textMuted}
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                style={[
                  styles.input,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.borderStrong, color: theme.colors.text },
                ]}
              />

              <AppText variant="label">Confirm new password</AppText>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                secureTextEntry
                placeholder="Re-enter your password"
                placeholderTextColor={theme.colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!busy}
                style={[
                  styles.input,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.borderStrong, color: theme.colors.text },
                ]}
              />

              {confirmPassword.length > 0 && password !== confirmPassword ? (
                <AppText variant="caption" muted>Passwords do not match.</AppText>
              ) : null}

              <Button disabled={!valid || busy} onPress={() => void updatePassword()}>
                {busy ? "Updating…" : "Update Password"}
              </Button>

              <Button variant="ghost" onPress={() => router.replace("/auth/forgot-password")}>
                Request a new reset email
              </Button>
            </>
          ) : (
            <Button onPress={() => router.replace({ pathname: "/auth", params: { mode: "signin" } })}>
              Back to sign in
            </Button>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, justifyContent: "center", gap: 24 },
  heading: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 14 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 17 },
  message: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 5 },
});
