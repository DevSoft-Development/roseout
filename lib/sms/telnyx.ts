export type TelnyxSendResult = {
  id: string | null;
  status: string;
  raw: unknown;
};

export function normalizePhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

export async function sendTelnyxSms(params: { to: string; body: string }): Promise<TelnyxSendResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_PHONE_NUMBER;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const to = normalizePhone(params.to);

  if (!apiKey || !from) {
    throw new Error("SMS provider is not configured. Set TELNYX_API_KEY and TELNYX_PHONE_NUMBER.");
  }
  if (!to) throw new Error("SMS recipient is missing.");

  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      text: params.body,
      ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || payload?.message || response.statusText;
    throw new Error(`Telnyx SMS failed (${response.status}): ${String(message || "unknown error")}`);
  }

  const data = payload?.data || payload;
  return { id: data?.id || null, status: data?.to?.[0]?.status || data?.status || "queued", raw: payload };
}
