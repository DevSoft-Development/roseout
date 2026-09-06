import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

export default function AuthScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const error = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    if (mode === "signup") {
      setMessage("Check your email if confirmation is required, then sign in.");
      setMode("signin");
      return;
    }
    router.back();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.page, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <AppText variant="eyebrow" accent>THEOUTHAVEN</AppText>
        <AppText variant="h1">{mode === "signin" ? "Welcome back" : "Create your account"}</AppText>
        <AppText muted>
          {mode === "signin"
            ? "Sign in to save OUTings, sync favorites, receive reminders, and review completed plans."
            : "Create one account for TheOutHaven across web and mobile."}
        </AppText>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email address"
            placeholderTextColor={theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong, color: theme.colors.text }]}
          />
          {message ? <AppText muted>{message}</AppText> : null}
          <Button disabled={busy || !email.trim() || password.length < 6} onPress={submit}>
            {busy ? "Working..." : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
          <Button variant="ghost" onPress={() => { setMessage(null); setMode(mode === "signin" ? "signup" : "signin"); }}>
            {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
          </Button>
          <Button variant="ghost" onPress={() => router.back()}>Continue as guest</Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  form: { gap: 12, marginTop: 12 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 },
});
