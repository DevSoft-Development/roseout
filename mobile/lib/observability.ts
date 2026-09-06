import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import { mobileConfig } from "@/lib/config";

let initialized = false;

export function initializeObservability() {
  if (initialized) return;
  initialized = true;
  if (!mobileConfig.sentryDsn) return;

  Sentry.init({
    dsn: mobileConfig.sentryDsn,
    environment: mobileConfig.releaseChannel,
    enabled: !__DEV__,
    tracesSampleRate: mobileConfig.releaseChannel === "production" ? 0.15 : 0.5,
    sendDefaultPii: false,
  });

  Sentry.setTag("app", "theouthaven-mobile");
  Sentry.setTag("release_channel", mobileConfig.releaseChannel);
  Sentry.setTag("app_version", Constants.expoConfig?.version || "unknown");
}

export function captureMobileError(error: unknown, context?: Record<string, unknown>) {
  if (!mobileConfig.sentryDsn) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext("mobile", context);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

export function setObservabilityUser(userId: string | null) {
  if (!mobileConfig.sentryDsn) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
