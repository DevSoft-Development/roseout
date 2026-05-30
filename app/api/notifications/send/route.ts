import { NextRequest, NextResponse } from "next/server";
import { sendBrandedEmail, sendRawBrandedEmail } from "@/lib/email/sender";
import { isEmailTemplateKey } from "@/lib/email/registry";
import { renderBrandedEmail } from "@/lib/email/render";
import { sendRenderedEmail } from "@/lib/email/sender";
import type { EmailDepartment } from "@/lib/email/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.secret !== process.env.NOTIFICATION_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const department = (body.department || "account") as EmailDepartment;
    let result;
    if (body.templateKey) {
      if (!isEmailTemplateKey(String(body.templateKey))) return NextResponse.json({ error: "Unknown templateKey" }, { status: 400 });
      result = await sendBrandedEmail({ to: body.toEmail, templateKey: body.templateKey, input: body.input || {}, department, replyTo: body.replyTo });
    } else if (body.subject && (body.body || body.heading)) {
      result = await sendRawBrandedEmail({ to: body.toEmail, subject: body.subject, heading: body.heading, preview: body.preview, body: body.body || body.emailHtml || body.subject, cta: body.cta, department, replyTo: body.replyTo });
    } else if (body.subject && body.emailHtml) {
      const rendered = renderBrandedEmail({ department, subject: body.subject, preview: body.preview || body.subject, heading: body.heading || body.subject, intro: String(body.emailHtml).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() });
      result = await sendRenderedEmail({ to: body.toEmail, rendered, department, replyTo: body.replyTo, templateKey: "legacy_wrapped" });
    } else {
      return NextResponse.json({ error: "Provide templateKey/input or subject/body." }, { status: 400 });
    }
    return NextResponse.json({ success: result.status !== "error", result });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notification failed" }, { status: 500 });
  }
}
