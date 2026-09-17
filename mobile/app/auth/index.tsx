import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeighborhoodPicker, type NeighborhoodOption } from "@/components/auth/NeighborhoodPicker";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const SMS_TERMS = "I agree to receive SMS messages from TheOutHaven about my account, saved plans, OUTing reminders, reservations, and optional offers. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function passwordStrength(password: string) {
  const checks = [
    password.length >= 10,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const passed = checks.filter(Boolean).length;
  const score = password.length === 0 ? 0 : passed <= 2 ? 1 : passed === 3 ? 2 : passed === 4 ? 3 : 4;
  const label = ["", "Weak", "Fair", "Good", "Strong"][score];
  return { score, label, strong: password.length >= 10 && passed >= 4 };
}

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(params.mode === "signup" ? "signup" : "signin");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [homeNeighborhood, setHomeNeighborhood] = useState<NeighborhoodOption | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  useEffect(() => {
    if (params.mode === "signup" || params.mode === "signin") {
      setMode(params.mode);
      setMessage(null);
      setVerifying(false);
    }
  }, [params.mode]);

  const valid = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (mode === "signin") return password.length >= 8;
    return firstName.trim().length >= 2
      && strength.strong
      && passwordsMatch
      && phone.replace(/\D/g, "").length === 10
      && birthMonth !== null
      && homeNeighborhood !== null;
  }, [birthMonth, email, firstName, homeNeighborhood, mode, password, passwordsMatch, phone, strength.strong]);

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
  }, [mode, email, password, phone, birthMonth, homeNeighborhood, smsConsent, firstName]);

  async function startVerification() {
    if (!valid || busy || verifying) return;
    setMessage(null);
    setVerifying(true);
    const action = mode === "signin" ? "mobile_signin" : "mobile_signup";
    const url = `${mobileConfig.siteUrl}/mobile/turnstile?action=${encodeURIComponent(action)}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      setVerifying(false);
      setMessage("Security verification is unavailable on this device right now.");
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
      : await signUp({
          firstName: firstName.trim(),
          email,
          password,
          phone: `+1${phone.replace(/\D/g, "")}`,
          birthMonth: birthMonth || 0,
          homeNeighborhood: homeNeighborhood!,
          smsConsent,
          captchaToken,
        });
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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 12, 28) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
          {mode === "signup" ? (
            <Field label="First name">
              <TextInput autoCapitalize="words" autoComplete="given-name" placeholder="First name" placeholderTextColor={theme.colors.textMuted} value={firstName} onChangeText={setFirstName} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
            </Field>
          ) : null}

          <Field label="Email">
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={theme.colors.textMuted} value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
          </Field>

          <Field label="Password" hint={mode === "signup" ? "Use 10+ characters with a mix of letters, numbers, and symbols." : undefined}>
            <TextInput autoCapitalize="none" autoComplete={mode === "signin" ? "current-password" : "new-password"} secureTextEntry placeholder="Password" placeholderTextColor={theme.colors.textMuted} value={password} onChangeText={setPassword} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
            {mode === "signup" ? (
              <View style={styles.strengthWrap}>
                <View style={styles.strengthBars}>
                  {[1, 2, 3, 4].map((level) => <View key={level} style={[styles.strengthBar, { backgroundColor: strength.score >= level ? theme.colors.accent : theme.colors.borderStrong }]} />)}
                </View>
                <AppText variant="caption" accent={strength.score >= 4} muted={strength.score < 4}>{strength.label || "Password strength"}</AppText>
              </View>
            ) : null}
          </Field>

          {mode === "signup" ? <>
            <Field label="Confirm password">
              <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry placeholder="Re-enter password" placeholderTextColor={theme.colors.textMuted} value={confirmPassword} onChangeText={setConfirmPassword} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: confirmPassword && !passwordsMatch ? theme.colors.accent : theme.colors.borderStrong, color: theme.colors.text }]} />
              {confirmPassword ? <AppText variant="caption" accent={passwordsMatch} muted={!passwordsMatch}>{passwordsMatch ? "Passwords match" : "Passwords do not match"}</AppText> : null}
            </Field>

            <Field label="Mobile number" hint="Used for account and OUTing updates when you opt in.">
              <TextInput keyboardType="phone-pad" autoComplete="tel" placeholder="(516) 555-0123" placeholderTextColor={theme.colors.textMuted} value={phone} onChangeText={(value) => setPhone(normalizePhone(value))} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]} />
            </Field>

            <Field label="Birth month">
              <Pressable accessibilityRole="button" accessibilityLabel="Select birth month" onPress={() => setMonthPickerOpen(true)} style={[styles.select, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
                <AppText style={{ color: birthMonth ? theme.colors.text : theme.colors.textMuted }}>{birthMonth ? MONTHS[birthMonth - 1] : "Select month"}</AppText>
                <AppText muted style={styles.selectChevron}>⌄</AppText>
              </Pressable>
            </Field>

            <Field label="Home neighborhood" hint="Start typing, then choose a neighborhood from TheOutHaven. We never ask for your street address.">
              <NeighborhoodPicker value={homeNeighborhood} onChange={setHomeNeighborhood} />
            </Field>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: smsConsent }} onPress={() => setSmsConsent((value) => !value)} style={[styles.consent, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}>
              <View style={[styles.checkbox, { borderColor: smsConsent ? theme.colors.accent : theme.colors.borderStrong, backgroundColor: smsConsent ? theme.colors.accent : "transparent" }]}>{smsConsent ? <AppText variant="caption" style={{ color: theme.colors.onAccent }}>✓</AppText> : null}</View>
              <AppText muted style={styles.consentText}>{SMS_TERMS}</AppText>
            </Pressable>
            <AppText variant="caption" muted style={styles.legal}>By creating an account, you agree to TheOutHaven Terms and acknowledge the Privacy Policy. SMS consent is optional.</AppText>
          </> : null}

          <View style={[styles.security, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}>
            <View style={[styles.securityIcon, { backgroundColor: theme.colors.accentSoft }]}><AppText accent>✓</AppText></View>
            <View style={styles.securityCopy}>
              <AppText variant="bodyStrong">Protected by Cloudflare Turnstile</AppText>
              <AppText variant="caption" muted style={styles.securityHint}>A quick security check opens before {mode === "signin" ? "sign in" : "account creation"}.</AppText>
            </View>
          </View>

          {message ? <View style={[styles.message, { borderColor: theme.colors.borderStrong }]}><AppText muted>{message}</AppText></View> : null}
          <Button disabled={!valid || busy || verifying} onPress={() => void startVerification()}>{busy ? "Working…" : verifying ? "Opening security check…" : mode === "signin" ? "Sign in" : "Create account"}</Button>
          {mode === "signin" ? <Button variant="ghost" onPress={() => Linking.openURL(`${mobileConfig.siteUrl}/forgot-password`)}>Forgot password?</Button> : null}
          <Button variant="ghost" onPress={() => router.replace("/(tabs)/profile")}>Continue as guest</Button>
        </View>
      </ScrollView>

      <Modal transparent animationType="fade" visible={monthPickerOpen} onRequestClose={() => setMonthPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMonthPickerOpen(false)}>
          <Pressable style={[styles.monthSheet, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.borderStrong }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.monthSheetHeader}>
              <AppText variant="h3">Birth month</AppText>
              <Pressable onPress={() => setMonthPickerOpen(false)} hitSlop={12}><AppText accent variant="bodyStrong">Done</AppText></Pressable>
            </View>
            <ScrollView style={styles.monthList} showsVerticalScrollIndicator={false}>
              {MONTHS.map((month, index) => {
                const selected = birthMonth === index + 1;
                return (
                  <Pressable key={month} onPress={() => { setBirthMonth(index + 1); setMonthPickerOpen(false); }} style={[styles.monthRow, { borderBottomColor: theme.colors.border }]}>
                    <AppText variant="bodyStrong" accent={selected}>{month}</AppText>
                    {selected ? <AppText accent>✓</AppText> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <View style={styles.field}><AppText variant="bodyStrong">{label}</AppText>{hint ? <AppText variant="caption" muted>{hint}</AppText> : null}{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 22, paddingBottom: 56, gap: 20 }, hero: { gap: 8, marginTop: 4 }, body: { lineHeight: 22 },
  segment: { flexDirection: "row", padding: 4, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.035)" }, segmentButton: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  form: { gap: 17 }, field: { gap: 7 }, input: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, fontWeight: "600" },
  strengthWrap: { gap: 7 }, strengthBars: { flexDirection: "row", gap: 6 }, strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  select: { minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, selectChevron: { fontSize: 20 },
  consent: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, alignItems: "flex-start" }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  consentText: { flex: 1, fontSize: 12, lineHeight: 18 }, legal: { lineHeight: 18 }, message: { borderWidth: 1, borderRadius: 16, padding: 13 },
  security: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 16, padding: 13 }, securityIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }, securityCopy: { flex: 1, gap: 2 }, securityHint: { lineHeight: 17 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end", padding: 14 }, monthSheet: { maxHeight: "72%", borderWidth: 1, borderRadius: 26, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22 }, monthSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 }, monthList: { flexGrow: 0 }, monthRow: { minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});