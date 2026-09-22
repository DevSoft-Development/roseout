import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_LOG_FIELDS = "id,template_key,sender_key,from_name,from_email,recipient_email,recipient_type,department,subject,status,sent_at,failed_at,failure_reason,source_type,source_id,created_at";

export async function GET() {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates);
  if (error) return error;
  const { data } = await supabaseAdmin.from("email_send_logs").select(EMAIL_LOG_FIELDS).order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ logs: data || [] });
}
