import { Modal, Pressable, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { AppText } from "@/components/ui/AppText";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";

type Props = {
  visible: boolean;
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

export function TurnstileVerificationModal({ visible, action, onCancel, onVerified, onError }: Props) {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.borderStrong }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText variant="h3">Secure sign in</AppText>
              <AppText variant="caption" muted>Finishing a quick security check inside TheOutHaven.</AppText>
            </View>
            <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel security check">
              <AppText accent variant="bodyStrong">Cancel</AppText>
            </Pressable>
          </View>

          <View style={[styles.webWrap, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.background }]}>
            <WebView
              source={{ uri: url }}
              onMessage={handleMessage}
              onError={() => onError("Security verification is unavailable right now. Please try again.")}
              onHttpError={() => onError("Security verification is unavailable right now. Please try again.")}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              originWhitelist={["https://*", "http://*"]}
              setSupportMultipleWindows={false}
              style={styles.webview}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  sheet: {
    width: "100%",
    maxHeight: "72%",
    minHeight: 360,
    borderWidth: 1,
    borderRadius: 28,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  headerCopy: { flex: 1, gap: 4 },
  webWrap: {
    flex: 1,
    minHeight: 280,
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  webview: { flex: 1, backgroundColor: "transparent" },
});
