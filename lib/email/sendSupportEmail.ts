import { Resend } from "resend";
import { getEmailFrom, getEmailReplyTo, type EmailSenderDepartment } from "@/lib/email/emailSender";

export async function sendSupportEmail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
  department?: EmailSenderDepartment | string;
  from?: string;
  replyTo?: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required to send support emails");

  const resend = new Resend(key);
  const response = await resend.emails.send({
    from: params.from || getEmailFrom(params.department || "support"),
    to: params.to,
    subject: params.subject,
    text: params.body,
    html: params.html,
    replyTo: params.replyTo || getEmailReplyTo(),
  });

  return { id: (response as { data?: { id?: string } })?.data?.id || null, raw: response };
}
