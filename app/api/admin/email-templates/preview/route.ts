import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getEmailTemplate, isEmailTemplateKey } from "@/lib/email/registry";
import { resolveEmailSender } from "@/lib/email/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  if (error) return error;
  const body = await req.json();
  if (!isEmailTemplateKey(String(body.templateKey))) return NextResponse.json({ error: "Unknown templateKey" }, { status: 400 });
  const rendered = getEmailTemplate(body.templateKey, body.input || {});
  const sender = resolveEmailSender(rendered.department);
  return NextResponse.json({ subject: rendered.subject, preview: rendered.preview, html: rendered.html, text: rendered.text, department: rendered.department, fromEmail: sender.fromEmail, replyTo: sender.replyTo });
}
