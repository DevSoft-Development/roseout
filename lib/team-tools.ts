import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const GLOBAL_WORK_TYPES = [
  "field_visit","site_visit","social_outreach","phone_outreach","email_outreach","customer_support","owner_support","reservation_support","claim_support","listing_review","photo_review","quality_review","crm_cleanup","support_ticket","follow_up","email_follow_up","phone_follow_up","claim_code_delivery","qr_dropoff","owner_meeting","reservation_setup","reservation_demo","onboarding_support","team_review","payroll_review","proof_review","training","demo","admin_work","other",
] as const;

export type TeamType = "ambassador" | "experience_team" | "sales_team" | "support_team" | "manager" | "superadmin";

export const TEAM_TYPES: TeamType[] = ["ambassador", "experience_team", "sales_team", "support_team", "manager", "superadmin"];

export const DEFAULT_WORK_TYPES_BY_TEAM_TYPE: Record<TeamType, string[]> = {
  ambassador: ["field_visit","site_visit","social_outreach","phone_outreach","email_outreach","follow_up","claim_code_delivery","qr_dropoff","owner_meeting","reservation_setup","training","demo","other"],
  experience_team: ["customer_support","owner_support","reservation_support","claim_support","support_ticket","listing_review","photo_review","quality_review","crm_cleanup","email_follow_up","phone_follow_up","training","admin_work","other"],
  sales_team: ["social_outreach","phone_outreach","email_outreach","follow_up","owner_meeting","claim_code_delivery","reservation_demo","onboarding_support","training","admin_work","other"],
  support_team: ["customer_support","owner_support","reservation_support","claim_support","support_ticket","email_follow_up","phone_follow_up","admin_work","training","other"],
  manager: ["team_review","payroll_review","proof_review","quality_review","crm_cleanup","support_ticket","training","admin_work","other"],
  superadmin: [...GLOBAL_WORK_TYPES],
};

export function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function formatMinutes(minutes: number | null | undefined) {
  const safe = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getTeamProfileForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("team_member_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

export async function ensureTeamProfileForCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication is required.");
  let profile = await getTeamProfileForUser(user.id);
  if (profile) return { user, profile };

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = String((adminUser as any)?.role || "");
  const teamType = role === "superadmin" ? "superadmin" : role === "ambassador" ? "ambassador" : role === "experience" || role === "experience_team" ? "experience_team" : role === "admin" ? "manager" : "support_team";
  const insert = {
    user_id: user.id,
    team_type: teamType,
    status: "active",
    pay_type: teamType === "superadmin" ? "owner_or_training" : "hourly",
    include_in_payroll: false,
    can_clock_in: true,
    can_track_work: true,
    can_do_site_visits: ["superadmin", "ambassador"].includes(teamType),
    can_do_social_outreach: ["superadmin", "ambassador", "sales_team"].includes(teamType),
    can_work_support_tickets: ["superadmin", "experience_team", "support_team", "manager"].includes(teamType),
    can_use_demo_mode: true,
    allowed_work_types: [],
  };
  const { data, error } = await supabaseAdmin.from("team_member_profiles").insert(insert).select("*").single();
  if (error) throw error;
  profile = data;
  return { user, profile };
}

export async function getAllowedWorkTypesForUser(userId: string, profile?: any) {
  const { data, error } = await supabaseAdmin.rpc("get_allowed_work_types_for_user", { p_user_id: userId });
  if (!error && Array.isArray(data)) return data as string[];
  const currentProfile = profile || (await getTeamProfileForUser(userId));
  if (!currentProfile) return [];
  if (Array.isArray(currentProfile.allowed_work_types) && currentProfile.allowed_work_types.length) return currentProfile.allowed_work_types;
  return DEFAULT_WORK_TYPES_BY_TEAM_TYPE[currentProfile.team_type as TeamType] || [];
}

export async function isWorkTypeAllowed(userId: string, workType: string, profile?: any) {
  const allowed = await getAllowedWorkTypesForUser(userId, profile);
  return allowed.includes(workType);
}

export async function getActiveSession(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("team_work_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

export async function listUsersById(userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return new Map<string, { email: string | null; full_name: string | null }>();
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return new Map((data?.users || [])
    .filter((user) => unique.includes(user.id))
    .map((user) => [user.id, {
      email: user.email ?? null,
      full_name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null,
    }]));
}

export async function requireTeamAdmin() {
  const admin = await getCurrentAdmin();
  if (!["superadmin", "admin", "experience", "ambassador"].includes(admin.role)) {
    throw new Error("Team Tools access is not enabled for this admin role.");
  }
  return admin;
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function siteVisitVerification(distance: number | null, accuracy?: number | null) {
  if (accuracy && accuracy > 100) return "gps_accuracy_low";
  if (distance == null || Number.isNaN(distance)) return "needs_review";
  const feet = distance * 3.28084;
  if (feet <= 500) return "verified";
  if (feet <= 1000) return "needs_review";
  return "not_verified";
}

export function csvEscape(value: unknown) {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export async function listPermittedWorkspaceLocations(profile: any, columns = "id,name,location_name,address,city,state,latitude,longitude", limit = 200) {
  const directIds = Array.isArray(profile?.assigned_location_ids) ? profile.assigned_location_ids.filter(Boolean) : [];
  if (directIds.length) {
    const { data, error } = await supabaseAdmin.from("locations").select(columns).in("id", directIds).order("name").limit(limit);
    if (!error) return data || [];
  }

  try {
    const { data: assignments, error } = await supabaseAdmin
      .from("team_location_assignments")
      .select("location_id")
      .eq("team_member_id", profile?.id)
      .eq("status", "active")
      .limit(limit);
    if (!error && assignments?.length) {
      const ids = assignments.map((assignment: any) => assignment.location_id).filter(Boolean);
      const { data } = await supabaseAdmin.from("locations").select(columns).in("id", ids).order("name").limit(limit);
      return data || [];
    }
  } catch {
    // Some deployments do not have explicit assignment tables yet. Fall through to a capped list.
  }

  const { data } = await supabaseAdmin.from("locations").select(columns).order("name").limit(limit);
  return data || [];
}
