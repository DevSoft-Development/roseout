import {
  platformIntegrationApiConfigured,
  sendTelnyxSmsViaIntegrationApi,
} from "./aws-integration.ts";

export type SendSmsInput = { to?: string | null; body: string };
export type SendSmsResult = { sent: boolean; skipped: boolean; status?: string; sid?: string | null; reason?: string; error?: string };

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalizePhone(value?: string | null) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}
function safeProviderError(value: unknown) { return clean(value || "SMS provider failed.").replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").slice(0, 240); }

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const recipient = normalizePhone(to);
  const message = clean(body);
  if (!recipient) return { sent: false, skipped: true, reason: "missing_recipient_phone" };
  if (!message) return { sent: false, skipped: true, reason: "missing_sms_body" };
  if (message.length > 1600) return { sent: false, skipped: true, reason: "sms_body_too_long" };
  if (!platformIntegrationApiConfigured()) return { sent: false, skipped: false, error: "aws_platform_integration_api_not_configured" };
  try {
    const sent = await sendTelnyxSmsViaIntegrationApi("reservations", recipient, message);
    return { sent: true, skipped: false, status: clean(sent.status) || "queued", sid: clean(sent.id) || null };
  } catch (error) {
    return { sent: false, skipped: false, error: safeProviderError(error instanceof Error ? error.message : error) };
  }
}
