import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const SMS_TERMS = "I agree to receive SMS messages from TheOutHaven about my account, saved plans, OUTing reminders, reservations, and optional offers. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { theme } = useAppTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(params.mode === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (params.mode === "signup" || params.mode === "signin") {
      setMode(params.mode);
      setMessage(null);
      setVerifying(false);
    }
  }, [params.mode]);

  const valid = useMemo(() => {
    if (!email.trim() || password.length < 8) return false;
    if (mode === "signin") return true;
    return phone.replace(/\D/g, "").length === 10 && birthMonth !== null;
  }, [birthMonth, email, mode, password, phone]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!url.startsWith("theouthaven://auth/turnstile")) return;
      const parsed = new URL(url);
      const token = parsed.searchParams.get("token") || "";
      const action = parsed.searchParams.get("action") || "";
      const expected = mode === "signin" ? "mobile_signin" : "mobile_signup";
      if (!token || action !== expected) {
        setVerifying(false);
        setMessage("Verification did not complete. Please try again.");
        return;
      }
      void submit(token);
    });
    return () => subscription.remove();
  }, [mode, email, password, phone, birthMonth, smsConsent]);

  async function startVerification() {
    if (!valid || busy || verifying) return;
    setMessage(null);
    setVerifying(true);
    const action = mode === "signin" ? "mobile_signin" : "mobile_signup";
    const url = `${mobileConfig.siteUrl}/mobile/turnstile?action=${encodeURIComponent(action)}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      setVerifying(false);
      setMessage("Verification is unavailable on this device right now.");
      return;
    }
    await Linking.openURL(url);
  }

  async function submit(captchaToken: string) {
    setBusy(true);
    setVerifying(false);
    setMessage(null);
    const result = mode === "signin"
      ? await signIn({ email, password, captchaToken })
      : await signUp({ email, password, phone: `+1${phone.replace(/\D/g, "")}`, birthMonth: birthMonth || 0, smsConsent, captchaToken });
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    if (mode === "signup" && result.requiresEmailConfirmation) {
      setMessage("Account created. Check your email to confirm your account, then sign in.");
      setMode("signin");
      return;
    }
    router.replace("/(tabs)/profile");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <BrandHeader compact />
        <View style={styles.hero}>
          <AppText variant="eyebrow" accent>{mode === "signin" ? "WELCOME BACK" : "JOIN THEOUTHAVEN"}</AppText>
          <AppText variant="h1">{mode === "signin" ? "Sign in" : "Create your account"}</AppText>
          <AppText muted style={styles.body}>{mode === "signin" ? "Your saved places, plans, favorites, and OUTings are waiting." : "Save what you love, keep your plans together, and get timely OUTing updates."}</AppText>
        </View>

        <View style={styles.segment}>
          {(["signin", "signup"] as const).map((value) => (
            <Pressable key={value} onPress={() => { setMode(value); setMessage(null); setVerifying(false); }} style={[styles.segmentButton, mode === value && { backgroundColor: theme.colors.surfaceElevated }]}>
              <AppText variant="bodyStrong" accent={mode === value}>{value === "signin" ? "Sign in" : "Create account"}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.form}>
          <Field label="Email">
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={theme.colors.textMuted} value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
          </Field>
          <Field label="Password" hint="8 characters minimum">
            <TextInput autoCapitalize="none" autoComplete={mode === "signin" ? "current-password" : "new-password"} secureTextEntry placeholder="Password" placeholderTextColor={theme.colors.textMuted} value={password} onChangeText={setPassword} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
          </Field>

          {mode === "signup" ? <>
            <Field label="Mobile number" hint="Used for account and OUTing updates when you opt in.">
              <TextInput keyboardType="phone-pad" autoComplete="tel" placeholder="(516) 555-0123" placeholderTextColor={theme.colors.textMuted} value={phone} onChangeText={(value) => setPhone(normalizePhone(value))} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
            </Field>
            <Field label="Birth month" hint="Month only — we do not need your full birthday.">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>
                {MONTHS.map((month, index) => {
                  const selected = birthMonth === index + 1;
                  return <Pressable key={month} onPress={() => setBirthMonth(index + 1)} style={[styles.month, { borderColor: selected ? theme.colors.accent : theme.colors.borderStrong, backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface }]}><AppText variant="caption" accent={selected}>{month}</AppText></Pressable>;
                })}
              </ScrollView>
            </Field>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: smsConsent }} onPress={() => setSmsConsent((value) => !value)} style={[styles.consent, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}>
              <View style={[styles.checkbox, { borderColor: smsConsent ? theme.colors.accent : theme.colors.borderStrong, backgroundColor: smsConsent ? theme.colors.accent : "transparent" }]}>{smsConsent ? <AppText variant="caption" style={{ color: theme.colors.onAccent }}>✓</AppText> : null}</View>
              <AppText muted style={styles.consentText}>{SMS_TERMS}</AppText>
            </Pressable>
            <AppText variant="caption" muted style={styles.legal}>By creating an account, you agree to TheOutHaven Terms and acknowledge the Privacy Policy. SMS consent is optional.</AppText>
          </> : null}

          {message ? <View style={[styles.message, { borderColor: theme.colors.borderStrong }]}><AppText muted>{message}</AppText></View> : null}
          <Button disabled={!valid || busy || verifying} onPress={() => void startVerification()}>{busy ? "Working…" : verifying ? "Complete verification…" : mode === "signin" ? "Verify & Sign In" : "Verify & Create Account"}</Button>
          {mode === "signin" ? <Button variant="ghost" onPress={() => Linking.openURL(`${mobileConfig.siteUrl}/forgot-password`)}>Forgot password?</Button> : null}
          <Button variant="ghost" onPress={() => router.replace("/(tabs)/profile")}>Continue as guest</Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <View style={styles.field}><AppText variant="bodyStrong">{label}</AppText>{hint ? <AppText variant="caption" muted>{hint}</AppText> : null}{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 48, gap: 20 }, hero: { gap: 8, marginTop: 8 }, body: { lineHeight: 22 },
  segment: { flexDirection: "row", padding: 4, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.035)" }, segmentButton: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  form: { gap: 17 }, field: { gap: 7 }, input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, fontWeight: "600" },
  months: { gap: 8, paddingVertical: 2 }, month: { minWidth: 54, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  consent: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, alignItems: "flex-start" }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  consentText: { flex: 1, fontSize: 12, lineHeight: 18 }, legal: { lineHeight: 18 }, message: { borderWidth: 1, borderRadius: 16, padding: 13 },
});
