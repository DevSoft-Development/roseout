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
