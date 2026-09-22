import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getEmailTemplate, isEmailTemplateKey } from "@/lib/email/registry";
import { resolveEmailSender } from "@/lib/email/brand";
import { getSampleDataForTemplate } from "@/lib/email/sample-data";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(req: Request) { const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates); if (error) return error; const body = await req.json(); if (!isEmailTemplateKey(String(body.templateKey))) return NextResponse.json({ error: "Unknown templateKey" }, { status: 400 }); const rendered = getEmailTemplate(body.templateKey, body.input || getSampleDataForTemplate()); const sender = resolveEmailSender(rendered.senderKey || rendered.department); return NextResponse.json({ ...rendered, sender }); }
