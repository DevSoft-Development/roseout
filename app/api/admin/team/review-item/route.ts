import { revalidatePath } from "next/cache";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
const REVIEW_TABLES = new Set(["location_change_requests", "ambassador_site_visits", "ambassador_social_outreach", "team_proofs", "claim_code_audit_logs", "password_reset_audit_logs", "workspace_escalations", "team_work_sessions"]);

export async function POST(req: Request) {
  const { error: authError, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.dashboard);
  if (authError) return authError;
  const body = await req.json();
  const table = String(body.table || "");
  if (!REVIEW_TABLES.has(table)) return Response.json({ error: "Unsupported review table." }, { status: 400 });
  const id = String(body.id || "");
  const action = String(body.action || "approve");
  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : "rejected";
  const updates: Record<string, unknown> = { updated_at: now };
  if (table === "team_work_sessions") Object.assign(updates, { status, approval_status: status === "approved" ? "approved" : "rejected", approved_by: status === "approved" ? adminUser?.user_id : null, approved_at: status === "approved" ? now : null, rejection_reason: status === "rejected" ? body.notes || "Rejected by manager" : null });
  else if (table === "location_change_requests") Object.assign(updates, { status, reviewed_by: adminUser?.user_id, reviewed_at: now, review_notes: body.notes || null });
  else if (["ambassador_site_visits", "ambassador_social_outreach", "team_proofs"].includes(table)) Object.assign(updates, { manager_review_status: status, reviewed_by: adminUser?.user_id, reviewed_at: now, rejection_reason: action === "reject" ? body.notes || "Rejected by manager" : null });
  else Object.assign(updates, { status });
  const { data, error } = await supabaseAdmin.from(table).update(updates).eq("id", id).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  await supabaseAdmin.from("workspace_audit_logs").insert({ actor_user_id: adminUser!.user_id, action: `manager_${action}`, entity_type: table, entity_id: id, new_value: data }).then(undefined, () => undefined);
  revalidatePath("/admin/dashboard/team/review");
  return Response.json({ item: data });
}
