import {
  platformIntegrationApiConfigured,
  sendTelnyxSmsViaIntegrationApi,
} from "./aws-integration.ts";

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
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

async function directSendSms(recipient: string, body: string): Promise<SendSmsResult> {
  const apiKey = Deno.env.get("TELNYX_TRANSACTIONAL_API_KEY") || Deno.env.get("TELNYX_API_KEY");
  const from = Deno.env.get("TELNYX_TRANSACTIONAL_PHONE_NUMBER") || Deno.env.get("TELNYX_PHONE_NUMBER");
  const messagingProfileId =
    Deno.env.get("TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID") || Deno.env.get("TELNYX_MESSAGING_PROFILE_ID");

  if (!apiKey || !from || !messagingProfileId) {
    return { sent: false, skipped: true, reason: "transactional_telnyx_not_configured" };
  }

  try {
    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipient,
        text: body,
        use_profile_webhooks: true,
        messaging_profile_id: messagingProfileId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerError = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || response.statusText || `HTTP ${response.status}`;
      return { sent: false, skipped: false, status: `http_${response.status}`, error: safeProviderError(providerError) };
    }

    const data = payload?.data || {};
    return {
      sent: true,
      skipped: false,
      status: clean(data?.to?.[0]?.status) || "queued",
      sid: clean(data?.id) || null,
    };
  } catch (error) {
    return { sent: false, skipped: false, error: safeProviderError(error instanceof Error ? error.message : error) };
  }
}

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const recipient = normalizePhone(to);
  const message = clean(body);

  if (!recipient) return { sent: false, skipped: true, reason: "missing_recipient_phone" };
  if (!message) return { sent: false, skipped: true, reason: "missing_sms_body" };
  if (message.length > 1600) return { sent: false, skipped: true, reason: "sms_body_too_long" };

  if (platformIntegrationApiConfigured()) {
    try {
      const sent = await sendTelnyxSmsViaIntegrationApi("reservations", recipient, message);
      return {
        sent: true,
        skipped: false,
        status: clean(sent.status) || "queued",
        sid: clean(sent.id) || null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== "aws_platform_integration_api_http_404") {
        return { sent: false, skipped: false, error: safeProviderError(errorMessage) };
      }
      console.warn("[sms] AWS Integration Telnyx route is not deployed; using direct rollout fallback");
    }
  }

  return await directSendSms(recipient, message);
}
