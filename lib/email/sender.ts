import { Resend } from "resend";
import { resolveEmailSender } from "./brand";
import { renderBrandedEmail } from "./render";
import { getEmailTemplate, type EmailTemplateKey } from "./registry";
import type { EmailCta, EmailDepartment, EmailSection, RenderedEmail } from "./types";
import type { CommonTemplateInput } from "./templates";

type SendResult = { status: "sent" | "skipped" | "error"; id?: string | null; rendered?: RenderedEmail; error?: string };

export async function sendRenderedEmail(params: { to?: string | string[] | null; rendered: RenderedEmail; department?: EmailDepartment | string; replyTo?: string; cc?: string | string[]; bcc?: string | string[]; templateKey?: string }): Promise<SendResult> {
  if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) return { status: "skipped", rendered: params.rendered };
  const sender = resolveEmailSender(params.department || params.rendered.department);
  console.info("Sending TheOutHaven email", { templateKey: params.templateKey || "raw", to: Array.isArray(params.to) ? params.to.length : params.to });
  if (!process.env.RESEND_API_KEY) return { status: "skipped", rendered: params.rendered };
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const response = await resend.emails.send({
      from: sender.from,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.rendered.subject,
      html: params.rendered.html,
      text: params.rendered.text,
      replyTo: params.replyTo || sender.replyTo,
    });
    return { status: "sent", id: response.data?.id || null, rendered: params.rendered };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Email send failed", rendered: params.rendered };
  }
}

export async function sendBrandedEmail(params: { to?: string | string[] | null; templateKey: EmailTemplateKey | string; input?: CommonTemplateInput; department?: EmailDepartment | string; replyTo?: string; cc?: string | string[]; bcc?: string | string[] }) {
  const rendered = getEmailTemplate(params.templateKey, { ...(params.input || {}), department: params.department || params.input?.department });
  return sendRenderedEmail({ ...params, rendered, templateKey: String(params.templateKey) });
}

export async function sendRawBrandedEmail(params: { to?: string | string[] | null; subject: string; heading?: string; preview?: string; body?: string; sections?: EmailSection[]; cta?: EmailCta; department?: EmailDepartment | string; replyTo?: string; cc?: string | string[]; bcc?: string | string[] }) {
  const department = (params.department || "account") as EmailDepartment;
  const rendered = renderBrandedEmail({ department, subject: params.subject, preview: params.preview || params.subject, heading: params.heading || params.subject, intro: params.sections?.length ? undefined : params.body || "", sections: params.sections || [], cta: params.cta });
  return sendRenderedEmail({ ...params, department, rendered, templateKey: "raw" });
}
