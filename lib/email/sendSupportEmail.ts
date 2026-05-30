import { sendRawBrandedEmail } from "./sender";
import type { EmailDepartment } from "./types";

export async function sendSupportEmail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
  department?: EmailDepartment | string;
  from?: string;
  replyTo?: string;
}) {
  const result = await sendRawBrandedEmail({
    to: params.to,
    subject: params.subject,
    heading: params.subject,
    body: params.body || params.html || params.subject,
    department: params.department || "support",
    replyTo: params.replyTo,
  });
  return { id: result.id || null, raw: result };
}
