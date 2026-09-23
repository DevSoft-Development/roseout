import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { AppText } from "@/components/ui/AppText";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";

type Props = {
  action: "mobile_signin" | "mobile_signup";
  verified: boolean;
  onVerified: (token: string) => void;
  onError: (message: string) => void;
};

type TurnstileMessage = {
  type?: string;
  token?: string;
  action?: string;
  message?: string;
};

export function TurnstileVerificationInline({ action, verified, onVerified, onError }: Props) {
  const { theme } = useAppTheme();
  const url = `${mobileConfig.siteUrl}/api/mobile/v1/turnstile-frame?action=${encodeURIComponent(action)}`;

  function completeVerification(token?: string, messageAction?: string) {
    if (token && messageAction === action) {
      onVerified(token);
      return true;
    }
    return false;
  }

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as TurnstileMessage;
      if (payload.type === "turnstile-success" && completeVerification(payload.token, payload.action)) {
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
      accessibilityLabel="Security verification"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: verified ? theme.colors.accent : theme.colors.borderStrong,
        },
      ]}
    >
      {verified ? (
        <View style={styles.verifiedRow}>
          <View style={[styles.verifiedIcon, { backgroundColor: theme.colors.accentSoft }]}>
            <AppText accent>✓</AppText>
          </View>
          <View style={styles.verifiedCopy}>
            <AppText variant="bodyStrong">Verification complete</AppText>
            <AppText variant="caption" muted>You can continue securely.</AppText>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.labelRow}>
            <AppText variant="bodyStrong">Security check</AppText>
          </View>
          <View style={[styles.webWrap, { backgroundColor: theme.colors.background }]}>
            <WebView
              source={{ uri: url }}
              onMessage={handleMessage}
              onError={() => onError("Security verification is unavailable right now. Please try again.")}
              onHttpError={() => onError("Security verification is unavailable right now. Please try again.")}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={["https://*", "http://*", "about:blank", "about:srcdoc"]}
              setSupportMultipleWindows={false}
              onNavigationStateChange={(navState) => {
                const marker = "#verified=";
                const index = navState.url.indexOf(marker);
                if (index < 0) return;
                const params = new URLSearchParams(navState.url.slice(index + 1));
                const token = params.get("verified") || "";
                const messageAction = params.get("action") || "";
                completeVerification(token, messageAction);
              }}
              scrollEnabled={false}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              style={styles.webview}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  labelRow: {
    minHeight: 22,
    justifyContent: "center",
  },
  webWrap: {
    height: 76,
    borderRadius: 12,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  verifiedRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  verifiedIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  verifiedCopy: {
    flex: 1,
    gap: 2,
  },
});
