import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { ThemeProvider, useAppTheme } from "@/providers/ThemeProvider";
import { trackMobileEvent } from "@/lib/analytics";
import { initializeObservability, setObservabilityUser } from "@/lib/observability";

initializeObservability();

function RuntimeBridge() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    setObservabilityUser(user?.id || null);
  }, [user?.id]);

  useEffect(() => {
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const outingId = typeof data?.outingId === "string" ? data.outingId : null;
      const reminderKind = typeof data?.reminderKind === "string" ? data.reminderKind : null;
      void trackMobileEvent("mobile_push_opened", {
        screen: outingId ? `/outing/${outingId}/active` : "/",
        outingId: outingId || undefined,
        metadata: { reminder_kind: reminderKind },
      });
      if (outingId) {
        router.push({ pathname: "/outing/[id]/active", params: { id: outingId } });
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then(openResponse);
    return () => subscription.remove();
  }, [router]);

  return null;
}

function ThemedStack() {
  const { theme, isDark } = useAppTheme();
  return (
    <>
      <RuntimeBridge />
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemedStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
