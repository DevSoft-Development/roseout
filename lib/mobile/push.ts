type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
};

export async function sendExpoPush(message: ExpoPushMessage) {
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

  return { id: typeof ticket?.id === "string" ? ticket.id : null };
}
