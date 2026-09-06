import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { mobileApi } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_physical_device" | "permission_denied" | "missing_project_id" | "unsupported_platform" };

function projectId() {
  return Constants.easConfig?.projectId || (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) || null;
}

export async function registerForOutingReminders(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) return { ok: false, reason: "not_physical_device" };
  if (Platform.OS !== "ios" && Platform.OS !== "android") return { ok: false, reason: "unsupported_platform" };

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("outing-reminders", {
      name: "OUTing reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return { ok: false, reason: "permission_denied" };

  const easProjectId = projectId();
  if (!easProjectId) return { ok: false, reason: "missing_project_id" };

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
  await mobileApi("/notifications/device", {
    method: "POST",
    body: JSON.stringify({
      expoPushToken: token,
      platform: Platform.OS,
      deviceName: Device.deviceName || Device.modelName || null,
      appVersion: Constants.expoConfig?.version || null,
      notificationsEnabled: true,
      transactionalEnabled: true,
      marketingEnabled: false,
    }),
  });

  return { ok: true, token };
}

export async function disableOutingReminders(token: string) {
  await mobileApi(`/notifications/device?token=${encodeURIComponent(token)}`, { method: "DELETE" });
}
