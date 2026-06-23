import { revalidatePath } from "next/cache";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { GLOBAL_WORK_TYPES } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

export async function POST() {
  const { error: authError, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.dashboard);
  if (authError) return authError;
  if (!adminUser || !["superadmin", "admin", "manager"].includes(adminUser.role)) return Response.json({ error: "Admin or manager access is required." }, { status: 403 });
  const { data, error } = await supabaseAdmin.from("team_member_profiles").upsert({
    user_id: adminUser.user_id,
    team_type: adminUser.role === "manager" ? "manager" : "superadmin",
    status: "active",
    pay_type: "owner_or_training",
    include_in_payroll: false,
    can_clock_in: true,
    can_track_work: true,
    can_do_site_visits: true,
    can_do_social_outreach: true,
    can_work_support_tickets: true,
    can_use_demo_mode: true,
    can_send_claim_codes: true,
    can_send_owner_password_reset: true,
    allowed_work_types: GLOBAL_WORK_TYPES,
    notes: "Created from Admin My Workspace profile setup.",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  await supabaseAdmin.from("workspace_audit_logs").insert({ actor_user_id: adminUser.user_id, actor_team_member_id: data.id, action: "create_superadmin_team_profile", entity_type: "team_member_profile", entity_id: data.id, new_value: data }).then(undefined, () => undefined);
  revalidatePath("/admin/dashboard/crm/work-queue?view=my-queue");
  return Response.json({ profile: data });
}
