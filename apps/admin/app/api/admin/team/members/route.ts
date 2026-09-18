import { revalidatePath } from "next/cache";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const GLOBAL_WORK_TYPES = [
  "field_visit",
  "site_visit",
  "social_outreach",
  "phone_outreach",
  "email_outreach",
  "customer_support",
  "owner_support",
  "reservation_support",
  "claim_support",
  "listing_review",
  "photo_review",
  "quality_review",
  "crm_cleanup",
  "support_ticket",
  "follow_up",
  "email_follow_up",
  "phone_follow_up",
  "claim_code_delivery",
  "qr_dropoff",
  "owner_meeting",
  "reservation_setup",
  "reservation_demo",
  "onboarding_support",
  "team_review",
  "payroll_review",
  "proof_review",
  "training",
  "demo",
  "admin_work",
  "other",
] as const;

const TEAM_TYPES = [
  "ambassador",
  "experience_team",
  "sales_team",
  "support_team",
  "manager",
  "superadmin",
] as const;

const TEAM_MEMBER_FIELDS =
  "id,user_id,team_type,status,pay_type,hourly_rate,include_in_payroll,can_clock_in,can_track_work,can_do_site_visits,can_do_social_outreach,can_work_support_tickets,can_use_demo_mode,allowed_work_types,manager_id,notes,created_at,updated_at,can_send_claim_codes,can_send_owner_password_reset";

export async function POST(req: Request) {
  await requireAdminRole(["superadmin"]);

  try {
    const body = await req.json();
    const userId = String(body.userId || "").trim();
    const teamType = String(body.teamType || "").trim();

    if (!userId || !TEAM_TYPES.includes(teamType as (typeof TEAM_TYPES)[number])) {
      return Response.json(
        { error: "Valid user and team type are required." },
        { status: 400 },
      );
    }

    const allowedWorkTypes = Array.isArray(body.allowedWorkTypes)
      ? body.allowedWorkTypes.filter((item: unknown) =>
          GLOBAL_WORK_TYPES.includes(item as (typeof GLOBAL_WORK_TYPES)[number]),
        )
      : [];

    const payload = {
      user_id: userId,
      team_type: teamType,
      status: body.status || "active",
      pay_type: body.payType || "hourly",
      hourly_rate:
        body.hourlyRate === "" || body.hourlyRate == null
          ? null
          : Number(body.hourlyRate),
      include_in_payroll: Boolean(body.includeInPayroll),
      can_clock_in: body.canClockIn !== false,
      can_track_work: body.canTrackWork !== false,
      can_do_site_visits: Boolean(body.canDoSiteVisits),
      can_do_social_outreach: Boolean(body.canDoSocialOutreach),
      can_work_support_tickets: Boolean(body.canWorkSupportTickets),
      can_send_claim_codes: Boolean(body.canSendClaimCodes),
      can_send_owner_password_reset: Boolean(body.canSendOwnerPasswordReset),
      can_use_demo_mode: body.canUseDemoMode !== false,
      allowed_work_types: allowedWorkTypes,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await getAdminDatabaseClient()
      .from("team_member_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select(TEAM_MEMBER_FIELDS)
      .single();

    if (error) throw error;

    revalidatePath("/admin/dashboard/team/members");
    return Response.json({ profile: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save team member.",
      },
      { status: 400 },
    );
  }
}
