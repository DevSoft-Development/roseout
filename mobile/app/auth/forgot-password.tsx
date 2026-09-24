import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TurnstileVerificationInline } from "@/components/auth/TurnstileVerificationInline";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";

function formatCountdown(seconds: number) {
  return `00:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [verificationKey, setVerificationKey] = useState(0);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const normalizedEmail = email.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  async function sendResetEmail() {
    if (!validEmail || !captchaToken || busy || cooldownSeconds > 0) return;
    setBusy(true);
    setMessage(null);
    setVerificationError(null);
    try {
      const response = await fetch(`${mobileConfig.siteUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          captchaToken,
          client: "mobile_app",
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        passwordResetEmailSent?: boolean;
        cooldownSeconds?: number;
      };

      if (!response.ok || payload.success === false) {
        setMessage(payload.error || "We could not send the password reset email.");
        return;
      }

      setCooldownSeconds(Math.max(1, Number(payload.cooldownSeconds || 60)));
      setMessage(
        payload.passwordResetEmailSent
          ? "Password reset email sent. Check your inbox, then tap the reset link to return to the app."
          : "If an account exists for this email, a password reset email has been requested."
      );
      setCaptchaToken(null);
      setVerificationKey((value) => value + 1);
    } catch {
      setMessage("We could not send the password reset email.");
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
          <AppText variant="eyebrow" accent>ACCOUNT RECOVERY</AppText>
          <AppText variant="h1">Forgot / Reset Password</AppText>
          <AppText muted>
            Enter your account email. We’ll send a secure reset link that returns you to TheOutHaven.
          </AppText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
          <AppText variant="label">Email</AppText>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            style={[
              styles.input,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.borderStrong, color: theme.colors.text },
            ]}
          />

          {message ? (
            <View style={[styles.message, { borderColor: theme.colors.borderStrong }]}>
              <AppText variant="bodyStrong">{message}</AppText>
              {cooldownSeconds > 0 ? (
                <AppText variant="caption" muted>
                  You can send another reset email in {formatCountdown(cooldownSeconds)}.
                </AppText>
              ) : null}
            </View>
          ) : null}

          {verificationError ? (
            <View style={[styles.message, { borderColor: theme.colors.borderStrong }]}>
              <AppText variant="caption" muted>{verificationError}</AppText>
            </View>
          ) : null}

          <TurnstileVerificationInline
            key={verificationKey}
            action="mobile_password_reset"
            verified={Boolean(captchaToken)}
            onVerified={(token) => {
              setCaptchaToken(token);
              setVerificationError(null);
            }}
            onError={(error) => {
              setCaptchaToken(null);
              setVerificationError(error);
            }}
          />

          <Button
            disabled={!validEmail || !captchaToken || busy || cooldownSeconds > 0}
            onPress={() => void sendResetEmail()}
          >
            {busy
              ? "Sending…"
              : cooldownSeconds > 0
                ? `Send again in ${formatCountdown(cooldownSeconds)}`
                : message
                  ? "Send Reset Email Again"
                  : "Send Reset Email"}
          </Button>

          <Button variant="ghost" onPress={() => router.replace({ pathname: "/auth", params: { mode: "signin" } })}>
            Back to sign in
          </Button>
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
