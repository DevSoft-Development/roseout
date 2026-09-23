import { Pressable, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { AppText } from "@/components/ui/AppText";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";

type Props = {
  action: "mobile_signin" | "mobile_signup";
  onCancel: () => void;
  onVerified: (token: string) => void;
  onError: (message: string) => void;
};

type TurnstileMessage = {
  type?: string;
  token?: string;
  action?: string;
  message?: string;
};

export function TurnstileVerificationInline({ action, onCancel, onVerified, onError }: Props) {
  const { theme } = useAppTheme();
  const url = `${mobileConfig.siteUrl}/mobile/turnstile?embedded=1&action=${encodeURIComponent(action)}`;

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as TurnstileMessage;
      if (payload.type === "turnstile-success" && payload.token && payload.action === action) {
        onVerified(payload.token);
        return;
      }
      if (payload.type === "turnstile-error") {
        onError(payload.message || "Security verification did not complete. Please try again.");
      }
    } catch {
      onError("Security verification did not complete. Please try again.");
    }
  }

  return (
    <View
      accessibilityLabel="Cloudflare security verification"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.borderStrong,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="bodyStrong">Security verification</AppText>
          <AppText variant="caption" muted style={styles.hint}>
            Complete the quick check below to continue without leaving this page.
          </AppText>
        </View>
        <Pressable
          onPress={onCancel}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Cancel security verification"
        >
          <AppText accent variant="bodyStrong">Cancel</AppText>
        </Pressable>
      </View>

      <View
        style={[
          styles.webWrap,
          {
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <WebView
          source={{ uri: url }}
          onMessage={handleMessage}
          onError={() => onError("Security verification is unavailable right now. Please try again.")}
          onHttpError={() => onError("Security verification is unavailable right now. Please try again.")}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled
          originWhitelist={["https://*", "http://*"]}
          setSupportMultipleWindows={false}
          style={styles.webview}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  hint: {
    lineHeight: 17,
  },
  webWrap: {
    height: 250,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
