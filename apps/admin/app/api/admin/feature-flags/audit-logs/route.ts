import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const FEATURE_FLAG_AUDIT_FIELDS = "id,flag_id,flag_key,action,previous_value,new_value,changed_by,created_at";

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.featureFlags);
  if (auth.error) return auth.error;
  const { data, error } = await supabaseAdmin
    .from("feature_flag_audit_logs")
    .select(FEATURE_FLAG_AUDIT_FIELDS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}
