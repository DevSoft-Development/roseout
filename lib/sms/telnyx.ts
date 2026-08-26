export type TelnyxSendResult = {
  id: string | null;
  status: string;
  raw: unknown;
};

export type TelnyxSmsPurpose = "transactional" | "crm" | "reservations" | "support" | "marketing" | "concierge";

export function normalizePhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

export const TELNYX_CHANNEL_NUMBERS = {
  concierge: normalizePhone(process.env.TELNYX_CONCIERGE_PHONE_NUMBER || "+15162000411"),
  crm: normalizePhone(process.env.TELNYX_CRM_PHONE_NUMBER || "+15162000701"),
  reservations: normalizePhone(process.env.TELNYX_RESERVATIONS_PHONE_NUMBER || process.env.TELNYX_TRANSACTIONAL_PHONE_NUMBER || "+15162000601"),
  support: normalizePhone(process.env.TELNYX_SUPPORT_PHONE_NUMBER || "+15162000801"),
  marketing: normalizePhone(process.env.TELNYX_MARKETING_PHONE_NUMBER || "+15162000501"),
  inactive: "+15162000704",
} as const;

function telnyxConfig(purpose: TelnyxSmsPurpose) {
  if (purpose === "concierge") {
    return {
      apiKey:
        process.env.TELNYX_CONCIERGE_API_KEY ||
        process.env.TELNYX_TRANSACTIONAL_API_KEY ||
        process.env.TELNYX_API_KEY,
      from: TELNYX_CHANNEL_NUMBERS.concierge,
      messagingProfileId:
        process.env.TELNYX_CONCIERGE_MESSAGING_PROFILE_ID ||
        process.env.TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID ||
        process.env.TELNYX_MESSAGING_PROFILE_ID,
      prefix: "TELNYX_CONCIERGE",
      label: "Concierge",
    };
  }

  if (purpose === "marketing") {
    return {
      apiKey: process.env.TELNYX_MARKETING_API_KEY,
      from: TELNYX_CHANNEL_NUMBERS.marketing,
      messagingProfileId: process.env.TELNYX_MARKETING_MESSAGING_PROFILE_ID,
      prefix: "TELNYX_MARKETING",
      label: "Marketing",
    };
  }

  if (purpose === "support") {
    return {
      apiKey: process.env.TELNYX_SUPPORT_API_KEY || process.env.TELNYX_TRANSACTIONAL_API_KEY || process.env.TELNYX_API_KEY,
      from: TELNYX_CHANNEL_NUMBERS.support,
      messagingProfileId:
        process.env.TELNYX_SUPPORT_MESSAGING_PROFILE_ID || process.env.TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID || process.env.TELNYX_MESSAGING_PROFILE_ID,
      prefix: "TELNYX_SUPPORT",
      label: "Support",
    };
  }

  if (purpose === "crm") {
    return {
      apiKey: process.env.TELNYX_CRM_API_KEY || process.env.TELNYX_TRANSACTIONAL_API_KEY || process.env.TELNYX_API_KEY,
      from: TELNYX_CHANNEL_NUMBERS.crm,
      messagingProfileId: process.env.TELNYX_CRM_MESSAGING_PROFILE_ID,
      prefix: "TELNYX_CRM",
      label: "CRM",
    };
  }

  if (purpose === "reservations" || purpose === "transactional") {
    return {
      apiKey:
        process.env.TELNYX_RESERVATIONS_API_KEY || process.env.TELNYX_TRANSACTIONAL_API_KEY || process.env.TELNYX_API_KEY,
      from: TELNYX_CHANNEL_NUMBERS.reservations,
      messagingProfileId:
        process.env.TELNYX_RESERVATIONS_MESSAGING_PROFILE_ID ||
        process.env.TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID ||
        process.env.TELNYX_MESSAGING_PROFILE_ID,
      prefix: "TELNYX_RESERVATIONS",
      label: "Reservations",
    };
  }

  throw new Error(`Unsupported Telnyx SMS purpose: ${purpose}`);
}

export function purposeForTelnyxNumber(value?: string | null): TelnyxSmsPurpose | null {
  const number = normalizePhone(value);
  if (!number) return null;
  if (number === TELNYX_CHANNEL_NUMBERS.concierge) return "concierge";
  if (number === TELNYX_CHANNEL_NUMBERS.crm) return "crm";
  if (number === TELNYX_CHANNEL_NUMBERS.reservations) return "reservations";
  if (number === TELNYX_CHANNEL_NUMBERS.support) return "support";
  if (number === TELNYX_CHANNEL_NUMBERS.marketing) return "marketing";
  return null;
}

export async function sendTelnyxSms(
  params: { to: string; body: string },
  purpose: TelnyxSmsPurpose = "transactional",
): Promise<TelnyxSendResult> {
  const { apiKey, from, messagingProfileId, prefix, label } = telnyxConfig(purpose);
  const to = normalizePhone(params.to);
  const normalizedFrom = normalizePhone(from);

  if (!apiKey || !normalizedFrom || !messagingProfileId) {
    throw new Error(`${label} SMS provider is not configured. Set ${prefix}_API_KEY, ${prefix}_PHONE_NUMBER, and ${prefix}_MESSAGING_PROFILE_ID.`);
  }
  if (!to) throw new Error("SMS recipient is missing.");

  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: normalizedFrom,
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

export function sendTelnyxSmsFromNumber(params: { to: string; body: string; fromNumber?: string | null }) {
  const purpose = purposeForTelnyxNumber(params.fromNumber) || "support";
  return sendTelnyxSms({ to: params.to, body: params.body }, purpose);
}

export function sendConciergeSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "concierge");
}

export function sendTransactionalSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "reservations");
}

export function sendCrmSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "crm");
}

export function sendReservationSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "reservations");
}

export function sendSupportSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "support");
}

export function sendMarketingSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params, "marketing");
}
