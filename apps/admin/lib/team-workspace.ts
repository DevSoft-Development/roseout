import "server-only";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const GLOBAL_WORK_TYPES = [
  "field_visit","site_visit","social_outreach","phone_outreach","email_outreach","customer_support","owner_support","reservation_support","claim_support","listing_review","photo_review","quality_review","crm_cleanup","support_ticket","follow_up","email_follow_up","phone_follow_up","claim_code_delivery","qr_dropoff","owner_meeting","reservation_setup","reservation_demo","onboarding_support","team_review","payroll_review","proof_review","training","demo","admin_work","other",
] as const;

const DEFAULT_WORK_TYPES: Record<string,string[]> = {
  ambassador: ["field_visit","site_visit","social_outreach","phone_outreach","email_outreach","follow_up","claim_code_delivery","qr_dropoff","owner_meeting","reservation_setup","training","demo","other"],
  experience_team: ["customer_support","owner_support","reservation_support","claim_support","support_ticket","listing_review","photo_review","quality_review","crm_cleanup","email_follow_up","phone_follow_up","training","admin_work","other"],
  sales_team: ["social_outreach","phone_outreach","email_outreach","follow_up","owner_meeting","claim_code_delivery","reservation_demo","onboarding_support","training","admin_work","other"],
  support_team: ["customer_support","owner_support","reservation_support","claim_support","support_ticket","email_follow_up","phone_follow_up","admin_work","training","other"],
  manager: ["team_review","payroll_review","proof_review","quality_review","crm_cleanup","support_ticket","training","admin_work","other"],
  superadmin: [...GLOBAL_WORK_TYPES],
};

export async function ensureTeamProfileForCurrentAdmin() {
  const admin = await getCurrentAdmin();
  const db = getAdminDatabaseClient();
  const { data: existing, error } = await db.from("team_member_profiles").select("*").eq("user_id", admin.user_id).maybeSingle();
  if (error) throw error;
  if (existing) return { admin, profile: existing };

  const teamType = admin.role === "superadmin" ? "superadmin" : admin.role === "ambassador" ? "ambassador" : admin.role === "experience_team" ? "experience_team" : admin.role === "admin" || admin.role === "manager" ? "manager" : "support_team";
  const { data, error: insertError } = await db.from("team_member_profiles").insert({
    user_id: admin.user_id,
    team_type: teamType,
    status: "active",
    pay_type: teamType === "superadmin" ? "owner_or_training" : "hourly",
    include_in_payroll: false,
    can_clock_in: true,
    can_track_work: true,
    can_do_site_visits: ["superadmin","ambassador"].includes(teamType),
    can_do_social_outreach: ["superadmin","ambassador","sales_team"].includes(teamType),
    can_work_support_tickets: ["superadmin","experience_team","support_team","manager"].includes(teamType),
    can_send_claim_codes: ["superadmin","ambassador","experience_team","support_team","manager"].includes(teamType),
    can_send_owner_password_reset: ["superadmin","experience_team","support_team","manager"].includes(teamType),
    can_use_demo_mode: true,
    allowed_work_types: [],
  }).select("*").single();
  if (insertError) throw insertError;
  return { admin, profile: data };
}

export async function getAllowedWorkTypesForUser(userId: string, profile: any) {
  const db = getAdminDatabaseClient();
  const { data, error } = await db.rpc("get_allowed_work_types_for_user", { p_user_id: userId });
  if (!error && Array.isArray(data)) return data as string[];
  if (Array.isArray(profile?.allowed_work_types) && profile.allowed_work_types.length) return profile.allowed_work_types as string[];
  return DEFAULT_WORK_TYPES[String(profile?.team_type || "")] || [];
}

export async function getActiveSession(userId: string) {
  const { data, error } = await getAdminDatabaseClient().from("team_work_sessions").select("*").eq("user_id", userId).eq("status", "active").order("clock_in_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function isWorkTypeAllowed(userId: string, workType: string, profile: any) {
  return (await getAllowedWorkTypesForUser(userId, profile)).includes(workType);
}
