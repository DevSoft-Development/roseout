export type SendEmailInput = { to: string | string[]; subject: string; html: string; text?: string };

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM") || "no-reply@theouthaven.com";
  if (!apiKey) return { sent: false, skipped: true, reason: "RESEND_API_KEY missing" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, skipped: false, error: data?.message ?? response.statusText, details: data };
  return { sent: true, skipped: false, id: data?.id ?? null };
}
