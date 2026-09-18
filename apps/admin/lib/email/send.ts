import { sendEmailViaIntegrationApi } from "@/lib/aws/integration-api";
import { renderBrandedEmail } from "./render";
import type { EmailCta, EmailDepartment } from "./types";
import { getEmailTemplate } from "./registry";
import { resolveEmailSender } from "./brand";
import { recordEmailSendLog } from "./logging";
import type { CommonTemplateInput } from "./templates";
export async function renderEmailForSend(templateKey: string, input: CommonTemplateInput = {}) {
  const rendered = getEmailTemplate(templateKey, input);
  const sender = resolveEmailSender(rendered.senderKey || rendered.department);
  return { rendered, sender };
}
export async function sendTemplatedEmail(args: { to: string; templateKey: string; input?: CommonTemplateInput; sourceType?: string; sourceId?: string }) {
  const { rendered, sender } = await renderEmailForSend(args.templateKey, args.input || {});
  await recordEmailSendLog({ template_key: args.templateKey, sender_key: rendered.senderKey, from_name: sender.fromName, from_email: sender.fromEmail, reply_to: sender.replyTo, recipient_email: args.to, recipient_type: rendered.recipientType, department: rendered.department, subject: rendered.subject, status: "queued", source_type: args.sourceType, source_id: args.sourceId });
  return { rendered, sender, queued: true };
}


export async function sendRawBrandedEmail(params: {
  to?: string | string[] | null;
  subject: string;
  heading?: string;
  preview?: string;
  body?: string;
  cta?: EmailCta;
  department?: EmailDepartment | string;
  replyTo?: string;
}) {
  const recipients = Array.isArray(params.to) ? params.to.filter(Boolean) : params.to ? [params.to] : [];
  if (!recipients.length) return { status: "skipped" as const, error: "Missing recipient email." };

  const department = (params.department || "account") as EmailDepartment;
  const rendered = renderBrandedEmail({
    department,
    subject: params.subject,
    preview: params.preview || params.subject,
    heading: params.heading || params.subject,
    intro: params.body || "",
    cta: params.cta,
  });
  const sender = resolveEmailSender(department);

  try {
    const result = await sendEmailViaIntegrationApi({
      from: sender.from,
      to: recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await recordEmailSendLog({
      template_key: "raw_branded",
      sender_key: department,
      from_name: sender.fromName,
      from_email: sender.fromEmail,
      reply_to: params.replyTo || sender.replyTo,
      recipient_email: recipients.join(","),
      department,
      subject: rendered.subject,
      status: "sent",
      metadata: { provider_id: result.id || null },
    });
    return { status: "sent" as const, id: result.id || null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    await recordEmailSendLog({
      template_key: "raw_branded",
      sender_key: department,
      from_name: sender.fromName,
      from_email: sender.fromEmail,
      reply_to: params.replyTo || sender.replyTo,
      recipient_email: recipients.join(","),
      department,
      subject: rendered.subject,
      status: "error",
      error_message: message,
    });
    return { status: "error" as const, error: message };
  }
}
