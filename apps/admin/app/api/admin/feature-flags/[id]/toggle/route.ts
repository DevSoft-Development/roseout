import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const FEATURE_FLAG_FIELDS = "id,key,name,description,category,enabled,environment,rollout_percentage,created_at,updated_at";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.featureFlags);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data: flag, error: lookupError } = await supabaseAdmin.from("feature_flags").select("id,key,enabled").eq("id", id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("feature_flags")
    .update({ enabled: !flag.enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(FEATURE_FLAG_FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("feature_flag_audit_logs").insert({
    flag_id: id,
    flag_key: flag.key,
    action: "toggle",
    previous_value: { enabled: flag.enabled },
    new_value: { enabled: data.enabled },
    changed_by: auth.adminUser?.user_id || null,
  });
  await logAdminEvent({
    category: "Feature Flags",
    message: `Flag toggled: ${flag.key}`,
    actor_id: auth.adminUser?.user_id,
    actor_email: auth.adminUser?.email,
    entity_type: "feature_flags",
    entity_id: id,
  });
  return NextResponse.json({ flag: data });
}
