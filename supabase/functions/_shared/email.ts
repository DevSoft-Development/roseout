export type SenderKey = "customer_account" | "vip" | "offers" | "picks" | "events" | "business_owner" | "reservations" | "support" | "billing" | "security" | "admin";
export type SendEmailInput = { to: string | string[]; subject: string; html: string; text?: string; senderKey?: SenderKey; replyTo?: string };

const senderMap: Record<SenderKey, { fromName: string; fromEmail: string; replyTo: string }> = {
  customer_account: { fromName: "TheOutHaven.com", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  vip: { fromName: "TheOutHaven VIP", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  offers: { fromName: "TheOutHaven Offers", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  picks: { fromName: "TheOutHaven Picks", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  events: { fromName: "TheOutHaven Events", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  business_owner: { fromName: "TheOutHaven Business", fromEmail: "business@theouthaven.com", replyTo: "business@theouthaven.com" },
  reservations: { fromName: "TheOutHaven Reservations", fromEmail: "reserve@theouthaven.com", replyTo: "reserve@theouthaven.com" },
  support: { fromName: "TheOutHaven Support", fromEmail: "support@theouthaven.com", replyTo: "support@theouthaven.com" },
  billing: { fromName: "TheOutHaven Billing", fromEmail: "support@theouthaven.com", replyTo: "support@theouthaven.com" },
  security: { fromName: "TheOutHaven Security", fromEmail: "support@theouthaven.com", replyTo: "support@theouthaven.com" },
  admin: { fromName: "TheOutHaven Admin", fromEmail: "admin@theouthaven.com", replyTo: "admin@theouthaven.com" },
};
export function resolveEmailSender(senderKey: SenderKey = "customer_account") { return senderMap[senderKey] || senderMap.customer_account; }
export function renderEnterpriseEmail(input: { subject: string; preview?: string; heading?: string; intro?: string; html: string; ctaUrl?: string; ctaLabel?: string }) {
  const text = [input.preview, input.heading || input.subject, input.intro, input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), input.ctaUrl].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;background:#090706;color:#fff7f2;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;color:transparent;">${input.preview || "TheOutHaven update"}</div><table role="presentation" width="100%" style="background:#090706;padding:34px 14px;"><tr><td align="center"><table role="presentation" width="100%" style="max-width:680px;border:1px solid rgba(255,255,255,.12);border-radius:28px;overflow:hidden;background:#141010;"><tr><td style="padding:30px;background:linear-gradient(135deg,#141010,#1c1614 58%,#2a0d13);border-bottom:1px solid rgba(255,255,255,.12);"><div style="font-size:22px;font-weight:900;">TheOutHaven</div><div style="margin-top:8px;color:#b8aaa3;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:900;">TheOutHaven.com</div><h1 style="margin:18px 0 0;color:#fff7f2;font-size:32px;line-height:38px;">${input.heading || input.subject}</h1>${input.intro ? `<p style="color:#b8aaa3;font-size:16px;line-height:25px;">${input.intro}</p>` : ""}</td></tr><tr><td style="padding:30px;color:#b8aaa3;font-size:15px;line-height:24px;">${input.html}${input.ctaUrl ? `<p style="margin-top:26px;"><a href="${input.ctaUrl}" style="display:inline-block;border-radius:999px;background:#e1062a;color:#fff;padding:14px 22px;text-decoration:none;font-weight:800;">${input.ctaLabel || "Open TheOutHaven"}</a></p>` : ""}</td></tr></table><div style="max-width:680px;margin:18px auto 0;color:#8f817a;font-size:12px;line-height:18px;text-align:center;">TheOutHaven.com · support@theouthaven.com</div></td></tr></table></body></html>`;
  return { html, text };
}
export async function sendEmail({ to, subject, html, text, senderKey = "customer_account", replyTo }: SendEmailInput): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = resolveEmailSender(senderKey);
  const from = `${sender.fromName} <${sender.fromEmail}>`;
  if (!apiKey) return { sent: false, skipped: true, reason: "RESEND_API_KEY missing" };
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, html, text, reply_to: replyTo || sender.replyTo }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, skipped: false, error: data?.message ?? response.statusText, details: data };
  return { sent: true, skipped: false, id: data?.id ?? null };
}
