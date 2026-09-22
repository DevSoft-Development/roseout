import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { EMAIL_TEMPLATE_KEYS, validateEmailTemplate } from "@/lib/email/registry";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates); if (error) return error; const health = EMAIL_TEMPLATE_KEYS.map(validateEmailTemplate); return NextResponse.json({ health }); }
