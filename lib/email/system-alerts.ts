import { sendEmailViaIntegrationApi } from "@/lib/aws/integration-api";

function firstRecipient() {
  const raw = String(
    process.env.PLATFORM_ERROR_DIGEST_TO
      || process.env.ADMIN_ALERT_EMAIL
      || process.env.ADMIN_EMAIL
      || process.env.SUPERADMIN_EMAIL
      || "",
  );
  return raw.split(",").map((value) => value.trim()).filter(Boolean)[0] || null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export async function sendSuperadminCriticalErrorEmail(input: {
  subject: string;
  heading: string;
  message: string;
  ctaUrl?: string | null;
}) {
  const to = firstRecipient();
  if (!to) return { sent: false, error: "admin_alert_recipient_not_configured" };
  const cta = input.ctaUrl
    ? `<p style="margin-top:24px"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#e1062a;color:#fff;text-decoration:none;font-weight:700">Open TheOutHaven Admin</a></p>`
    : "";
  try {
    await sendEmailViaIntegrationApi({
      from: "TheOutHaven Admin <admin@theouthaven.com>",
      to,
      subject: input.subject,
      text: `${input.heading}\n\n${input.message}${input.ctaUrl ? `\n\n${input.ctaUrl}` : ""}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px"><h1>${escapeHtml(input.heading)}</h1><p style="line-height:1.6">${escapeHtml(input.message)}</p>${cta}</div>`,
    });
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
