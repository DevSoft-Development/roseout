export type TelnyxSendResult = {
  id: string | null;
  status: string;
  raw: unknown;
};

export type TelnyxSmsPurpose = "transactional" | "marketing";

export function normalizePhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function telnyxConfig(purpose: TelnyxSmsPurpose) {
  if (purpose === "marketing") {
    return {
      apiKey: process.env.TELNYX_MARKETING_API_KEY,
      from: process.env.TELNYX_MARKETING_PHONE_NUMBER,
      messagingProfileId: process.env.TELNYX_MARKETING_MESSAGING_PROFILE_ID,
    };
  }

  return {
    apiKey: process.env.TELNYX_TRANSACTIONAL_API_KEY || process.env.TELNYX_API_KEY,
    from: process.env.TELNYX_TRANSACTIONAL_PHONE_NUMBER || process.env.TELNYX_PHONE_NUMBER,
    messagingProfileId:
      process.env.TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID || process.env.TELNYX_MESSAGING_PROFILE_ID,
  };
}

export async function sendTelnyxSms(
  params: { to: string; body: string },
  purpose: TelnyxSmsPurpose = "transactional",
): Promise<TelnyxSendResult> {
  const { apiKey, from, messagingProfileId } = telnyxConfig(purpose);
  const to = normalizePhone(params.to);

  if (!apiKey || !from || !messagingProfileId) {
    const prefix = purpose === "marketing" ? "TELNYX_MARKETING" : "TELNYX_TRANSACTIONAL";
    throw new Error(
      `${purpose === "marketing" ? "Marketing" : "Transactional"} SMS provider is not configured. Set ${prefix}_API_KEY, ${prefix}_PHONE_NUMBER, and ${prefix}_MESSAGING_PROFILE_ID.`,
    );
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
      messaging_profile_id: messagingProfileId,
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

export function sendTransactionalSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "transactional");
}

export function sendMarketingSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "marketing");
}
