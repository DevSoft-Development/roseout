type MobilePushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
};

export type MobilePushProvider = "expo";

/**
 * Temporary transport boundary for mobile push delivery.
 *
 * Azure owns mobile builds and OTA. Expo is retained only as the push
 * transport for already-registered Expo push tokens until native APNs/FCM
 * credentials are available. Do not add EAS Build, Submit, or Update
 * dependencies here.
 */
async function sendExpoPush(message: MobilePushMessage) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify({ sound: "default", priority: "high", ...message }),
  });

  const payload = await response.json().catch(() => ({}));
  const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  if (!response.ok || ticket?.status === "error") {
    throw new Error(ticket?.message || payload?.errors?.[0]?.message || `Expo push failed (${response.status})`);
  }

  return { id: typeof ticket?.id === "string" ? ticket.id : null, provider: "expo" as const };
}

export async function sendMobilePush(message: MobilePushMessage & { provider?: MobilePushProvider }) {
  const provider = message.provider || "expo";
  if (provider !== "expo") throw new Error(`Unsupported mobile push provider: ${provider}`);

  const { provider: _provider, ...providerMessage } = message;
  return sendExpoPush(providerMessage);
}
