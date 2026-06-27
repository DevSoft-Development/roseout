import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listEmailTemplates, EMAIL_TEMPLATE_GROUPS } from "@/lib/email/registry";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates); if (error) return error; return NextResponse.json({ templates: listEmailTemplates(), groups: EMAIL_TEMPLATE_GROUPS }); }
