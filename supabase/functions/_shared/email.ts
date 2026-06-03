export type EmailPayload = { to: string; subject: string; html?: string; text?: string };

export async function sendEmail(payload: EmailPayload) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM") ?? "TheOutHaven <no-reply@theouthaven.com>";

  if (!apiKey) {
    return { sent: false, skipped: true, reason: "RESEND_API_KEY missing" };
  }
  if (!payload.to) {
    return { sent: false, skipped: true, reason: "Missing recipient" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, skipped: false, error: data };
  return { sent: true, skipped: false, data };
}
