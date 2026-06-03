import { revalidatePath } from "next/cache";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { GLOBAL_WORK_TYPES, TEAM_TYPES } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);
  if (authError) return authError;
  try {
    const body = await req.json();
    const userId = String(body.userId || "").trim();
    const teamType = String(body.teamType || "").trim();
    if (!userId || !TEAM_TYPES.includes(teamType as any)) return Response.json({ error: "Valid user and team type are required." }, { status: 400 });
    const allowedWorkTypes = Array.isArray(body.allowedWorkTypes) ? body.allowedWorkTypes.filter((item: unknown) => GLOBAL_WORK_TYPES.includes(item as any)) : [];
    const payload = {
      user_id: userId,
      team_type: teamType,
      status: body.status || "active",
      pay_type: body.payType || "hourly",
      hourly_rate: body.hourlyRate === "" || body.hourlyRate == null ? null : Number(body.hourlyRate),
      include_in_payroll: Boolean(body.includeInPayroll),
      can_clock_in: body.canClockIn !== false,
      can_track_work: body.canTrackWork !== false,
      can_do_site_visits: Boolean(body.canDoSiteVisits),
      can_do_social_outreach: Boolean(body.canDoSocialOutreach),
      can_work_support_tickets: Boolean(body.canWorkSupportTickets),
      can_use_demo_mode: body.canUseDemoMode !== false,
      allowed_work_types: allowedWorkTypes,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from("team_member_profiles").upsert(payload, { onConflict: "user_id" }).select("*").single();
    if (error) throw error;
    revalidatePath("/admin/dashboard/team/members");
    return Response.json({ profile: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save team member." }, { status: 400 });
  }
}
