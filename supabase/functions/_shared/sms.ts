export type SendSmsInput = {
  to?: string | null;
  body: string;
};

export type SendSmsResult = {
  sent: boolean;
  skipped: boolean;
  status?: string;
  sid?: string | null;
  reason?: string;
  error?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value?: string | null) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function safeProviderError(value: unknown) {
  return clean(value || "SMS provider failed.")
    .replace(/AC[a-zA-Z0-9]{20,}/g, "[twilio-account]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_PHONE") || Deno.env.get("TWILIO_PHONE_NUMBER");
  const recipient = normalizePhone(to);

  if (!recipient) {
    return { sent: false, skipped: true, reason: "missing_recipient_phone" };
  }

  if (!sid || !token || !from) {
    return { sent: false, skipped: true, reason: "twilio_not_configured" };
  }

  try {
    const params = new URLSearchParams();
    params.set("To", recipient);
    params.set("From", from);
    params.set("Body", body);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        sent: false,
        skipped: false,
        status: clean(payload?.status) || `http_${response.status}`,
        error: safeProviderError(payload?.message || response.statusText || `HTTP ${response.status}`),
      };
    }

    return {
      sent: true,
      skipped: false,
      status: clean(payload?.status) || "queued",
      sid: clean(payload?.sid) || null,
    };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      error: safeProviderError(error instanceof Error ? error.message : error),
    };
  }
}
