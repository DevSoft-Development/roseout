import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { renderEmailForSend } from "@/lib/email/send";
import { recordEmailSendLog } from "@/lib/email/logging";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(req: Request) { const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates); if (error) return error; const body = await req.json(); const { rendered, sender } = await renderEmailForSend(String(body.templateKey), body.input || {}); await recordEmailSendLog({ template_key: body.templateKey, sender_key: rendered.senderKey, from_name: sender.fromName, from_email: sender.fromEmail, reply_to: sender.replyTo, recipient_email: body.to || "admin@theouthaven.com", recipient_type: rendered.recipientType, department: rendered.department, subject: rendered.subject, status: "queued", metadata: { test: true } }); return NextResponse.json({ ok: true, message: "Test email queued for provider integration.", subject: rendered.subject, sender }); }
