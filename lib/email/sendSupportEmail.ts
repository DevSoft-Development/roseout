import { Resend } from "resend";
import { SUPPORT_EMAIL_FROM } from "@/lib/support/ticketing";

export async function sendSupportEmail(params: { to: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required to send support emails");

  const resend = new Resend(key);
  const from = `TheOutHaven Support <${SUPPORT_EMAIL_FROM}>`;
  const response = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.body,
  });

  return { id: (response as { data?: { id?: string } })?.data?.id || null, raw: response };
}
