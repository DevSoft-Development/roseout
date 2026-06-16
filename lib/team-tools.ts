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
    can_send_claim_codes: ["superadmin", "ambassador", "experience_team", "support_team", "manager"].includes(teamType),
    can_send_owner_password_reset: ["superadmin", "experience_team", "support_team", "manager"].includes(teamType),
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


export async function isWorkspaceLocationPermitted(profile: any, locationId: string) {
  const cleanLocationId = String(locationId || "").trim();
  if (!cleanLocationId) return false;

  const directIds = Array.isArray(profile?.assigned_location_ids)
    ? profile.assigned_location_ids.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  if (directIds.length) return directIds.includes(cleanLocationId);

  try {
    const { data: assignments, error } = await supabaseAdmin
      .from("team_location_assignments")
      .select("location_id")
      .eq("team_member_id", profile?.id)
      .eq("status", "active")
      .limit(1000);

    if (!error && assignments?.length) {
      return assignments.some((assignment: any) => String(assignment.location_id) === cleanLocationId);
    }
  } catch {
    // Some deployments do not have explicit assignment tables yet. Fall through to checking the location exists.
  }

  const { data } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("id", cleanLocationId)
    .maybeSingle();

  return Boolean(data?.id);
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

export function canSearchAllWorkspaceLocations(userRole?: string | null) {
  return ["superadmin", "admin", "manager"].includes(String(userRole || "").toLowerCase());
}

export async function getWorkspaceLocationSearchScope(userId: string, role?: string | null, profile?: any) {
  const currentProfile = profile || (await getTeamProfileForUser(userId));
  const adminRole = String(role || currentProfile?.team_type || "").toLowerCase();
  return { all: canSearchAllWorkspaceLocations(adminRole) || currentProfile?.team_type === "superadmin", profile: currentProfile };
}

const WORKSPACE_LOCATION_SEARCH_COLUMNS = [
  "id",
  "name",
  "location_name",
  "restaurant_name",
  "activity_name",
  "business_name",
  "address",
  "city",
  "state",
  "borough",
  "neighborhood",
  "category",
  "primary_category",
  "location_type",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "phone",
  "phone_number",
  "contact_phone",
  "website",
  "instagram",
  "owner_instagram",
  "claim_status",
  "claim_outreach_status",
  "partner_sales_status",
  "reservation_portal_status",
  "reservation_embed_status",
  "discovery_profile_status",
  "plan",
  "plan_status",
  "subscription_plan",
  "subscription_status",
  "sales_campaign",
  "partner_launch_selected",
  "partner_launch_pilot",
  "updated_at",
  "created_at",
];

const FILTER_FIELD_MAP: Record<string, string> = {
  partnerSalesStatus: "partner_sales_status",
  claimOutreachStatus: "claim_outreach_status",
  reservationPortalStatus: "reservation_portal_status",
  reservationEmbedStatus: "reservation_embed_status",
  discoveryProfileStatus: "discovery_profile_status",
  planStatus: "plan_status",
  claimStatus: "claim_status",
};

const STATUS_ALIASES: Record<string, Record<string, string[]>> = {
  partnerSalesStatus: {
    active: ["active_partner"],
    ready: ["reservation_ready"],
    in_progress: ["contacted", "interested", "demo_setup"],
  },
  reservationPortalStatus: {
    not_started: ["not_enabled", "needs_setup"],
    ready: ["tested", "live"],
    active: ["enabled", "live"],
  },
  reservationEmbedStatus: {
    needed: ["not_sent", "generated", "needs_help"],
    complete: ["installed", "tested"],
  },
  discoveryProfileStatus: {
    needed: ["needs_review", "needs_photos", "needs_tags", "needs_hours"],
    in_progress: ["needs_photos", "needs_tags", "needs_hours"],
    complete: ["ready"],
  },
  planStatus: {
    free: ["inactive"],
    payment_pending: ["past_due", "trialing"],
  },
};

function cleanFilter(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean && clean.toLowerCase() !== "all" ? clean : "";
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildWorkspaceLocationHaystack(row: any): string {
  return [
    row.name,
    row.location_name,
    row.restaurant_name,
    row.activity_name,
    row.business_name,
    row.address,
    row.city,
    row.state,
    row.borough,
    row.neighborhood,
    row.category,
    row.primary_category,
    row.location_type,
    row.cuisine,
    row.cuisine_type,
    row.activity_type,
    row.phone,
    row.phone_number,
    row.contact_phone,
    row.website,
    row.instagram,
    row.owner_instagram,
    row.claim_status,
    row.claim_outreach_status,
    row.partner_sales_status,
    row.reservation_portal_status,
    row.reservation_embed_status,
    row.discovery_profile_status,
    row.plan,
    row.plan_status,
    row.subscription_plan,
    row.subscription_status,
    row.sales_campaign,
  ].filter(Boolean).join(" ");
}

export function workspaceLocationMatchesQuery(row: any, query: string): boolean {
  const rawQuery = String(query || "").trim().toLowerCase();
  if (!rawQuery) return true;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const rawHaystack = buildWorkspaceLocationHaystack(row).toLowerCase();
  const normalizedHaystack = normalizeSearchText(rawHaystack);
  if (rawHaystack.includes(rawQuery) || normalizedHaystack.includes(normalizedQuery)) return true;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => normalizedHaystack.includes(token));
}

function filterValueMatches(filterKey: string, rowValue: unknown, requested: string) {
  const actual = normalizeSearchText(rowValue).replace(/ /g, "_");
  const wanted = normalizeSearchText(requested).replace(/ /g, "_");
  if (!wanted) return true;
  if (actual === wanted) return true;
  return (STATUS_ALIASES[filterKey]?.[wanted] || []).some((alias) => actual === alias);
}

export function workspaceLocationMatchesFilters(row: any, filters: Record<string, any>, assignedIds: Set<string>): boolean {
  for (const [filterKey, column] of Object.entries(FILTER_FIELD_MAP)) {
    const value = cleanFilter(filters[filterKey]);
    if (value && !filterValueMatches(filterKey, row[column], value)) return false;
  }
  const assigned = cleanFilter(filters.assigned).toLowerCase();
  if (assigned === "assigned" && !assignedIds.has(String(row.id))) return false;
  if (assigned === "unassigned" && assignedIds.has(String(row.id))) return false;
  const launchPilot = cleanFilter(filters.launchPilot).toLowerCase();
  if (launchPilot === "yes" && row.partner_launch_pilot !== true) return false;
  if (launchPilot === "no" && row.partner_launch_pilot === true) return false;
  const partnerLaunchSelected = cleanFilter(filters.partnerLaunchSelected).toLowerCase();
  if (partnerLaunchSelected === "yes" && row.partner_launch_selected !== true) return false;
  if (partnerLaunchSelected === "no" && row.partner_launch_selected === true) return false;
  return true;
}

async function getActiveAssignmentMap(locationIds?: string[]) {
  try {
    let q = supabaseAdmin.from("team_location_assignments").select("location_id,team_member_id,priority,status,assignment_type,team_member_profiles(display_name,full_name,email,team_type)").eq("status", "active").limit(5000);
    if (locationIds?.length) q = q.in("location_id", locationIds);
    const { data, error } = await q;
    if (error) return new Map<string, any>();
    return new Map((data || []).map((row: any) => [String(row.location_id), row]));
  } catch (error) {
    console.warn("Workspace assignment lookup skipped", error);
    return new Map<string, any>();
  }
}

export function normalizeWorkspaceLocation(row: any, assignment?: any) {
  const profile = Array.isArray(assignment?.team_member_profiles) ? assignment.team_member_profiles[0] : assignment?.team_member_profiles;
  return {
    ...row,
    display_name: row.name || row.location_name || row.restaurant_name || row.activity_name || row.business_name || "Untitled location",
    display_phone: row.phone || row.phone_number || row.contact_phone || null,
    display_category: row.category || row.primary_category || row.cuisine || row.cuisine_type || row.activity_type || row.location_type || null,
    assigned_to: assignment?.team_member_id || null,
    assignment: assignment ? {
      team_member_id: assignment.team_member_id,
      label: profile?.display_name || profile?.full_name || profile?.email || assignment.team_member_id,
      team_type: profile?.team_type || null,
      priority: assignment.priority || null,
    } : null,
  };
}

function missingColumnFromWorkspaceError(error: any) {
  const message = String(error?.message || error?.details || "");
  return message.match(/Could not find the '([^']+)' column/i)?.[1] || message.match(/column [^.]*[."]?([a-zA-Z0-9_]+)(?:")? does not exist/i)?.[1] || null;
}

async function fetchWorkspaceLocationRows(columns: string[], limit: number, ids?: string[]) {
  let available = [...columns];
  for (let attempt = 0; attempt < columns.length + 2; attempt += 1) {
    let query = supabaseAdmin.from("locations").select(available.join(",")).order("updated_at", { ascending: false }).limit(limit);
    if (ids?.length) query = query.in("id", ids);
    const { data, error } = await query;
    if (!error) return data || [];
    const missing = missingColumnFromWorkspaceError(error);
    if (!missing || !available.includes(missing)) throw error;
    available = available.filter((column) => column !== missing);
  }
  return [];
}

export async function searchWorkspaceLocationsForUser(userId: string, role: string | null | undefined, query: string, filters: Record<string, any> = {}) {
  const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 5000);
  const fetchLimit = canSearchAllWorkspaceLocations(role) ? Math.max(limit, String(query || "").trim() ? 5000 : 500) : 1000;
  const scope = await getWorkspaceLocationSearchScope(userId, role);
  const q = String(query || "").trim();
  let rows: any[] = [];

  if (scope.all) {
    try {
      rows = await fetchWorkspaceLocationRows(WORKSPACE_LOCATION_SEARCH_COLUMNS, fetchLimit);
    } catch (error: any) {
      console.warn("Workspace location fetch failed", error?.message || error);
      rows = [];
    }
  } else {
    const permitted = await listPermittedWorkspaceLocations(scope.profile, "id", 5000);
    const ids = permitted.map((row: any) => row.id).filter(Boolean);
    rows = ids.length ? await fetchWorkspaceLocationRows(WORKSPACE_LOCATION_SEARCH_COLUMNS, Math.min(fetchLimit, ids.length), ids) : [];
  }

  const assignments = await getActiveAssignmentMap(rows.map((row) => row.id).filter(Boolean));
  const before = rows.length;
  rows = rows.filter((row) => workspaceLocationMatchesQuery(row, q));
  rows = rows.filter((row) => workspaceLocationMatchesFilters(row, filters, new Set(assignments.keys())));
  if (process.env.NODE_ENV !== "production") {
    console.warn("assign-location search", { query: q, filters, fetched: before, matched: rows.length });
  }
  return rows.slice(0, limit).map((row) => normalizeWorkspaceLocation(row, assignments.get(String(row.id))));
}

export async function listAssignableTeamMembers() {
  const { data } = await supabaseAdmin.from("team_member_profiles").select("id,user_id,team_type,status,display_name,full_name,email").eq("status", "active").in("team_type", ["ambassador", "sales_team", "manager", "superadmin"]).order("team_type");
  const users = await listUsersById((data || []).map((p: any) => p.user_id).filter(Boolean));
  return (data || []).map((p: any) => ({ ...p, label: p.display_name || p.full_name || p.email || users.get(p.user_id)?.full_name || users.get(p.user_id)?.email || `${labelize(p.team_type)} ${p.id}` }));
}

export async function listWorkspaceLocationAssignments(filters: Record<string, any> = {}) {
  let q = supabaseAdmin.from("team_location_assignments").select("*").eq("status", filters.status || "active").limit(Math.min(Number(filters.limit || 200), 1000));
  if (filters.teamMemberId) q = q.eq("team_member_id", filters.teamMemberId);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  const { data, error } = await q;
  if (!error) return data || [];
  return [];
}

export async function assignLocationsToWorkspaceUser(locationIds: string[], assignedTo: string | null, options: Record<string, any> = {}) {
  const cleanIds = Array.from(new Set(locationIds.map(String).filter(Boolean)));
  if (!cleanIds.length) return { ok: true, count: 0 };
  if (!assignedTo || assignedTo === "unassigned") {
    try {
      await supabaseAdmin.from("team_location_assignments").update({ status: "inactive", updated_at: new Date().toISOString() }).in("location_id", cleanIds).eq("status", "active");
    } catch (error) {
      console.warn("Could not clear workspace assignments", error);
    }
    return { ok: true, count: cleanIds.length };
  }
  const rows = cleanIds.map((location_id) => ({ location_id, team_member_id: assignedTo, assigned_by: options.assignedBy || null, status: "active", assignment_type: options.assignmentType || "partner_launch", priority: options.priority || "normal", reason: options.reason || null, notes: options.notes || null, campaign: options.campaign || "partner_launch", next_action_type: options.nextActionType || null, next_action_note: options.nextActionNote || null, next_action_due_at: options.nextActionDueAt || null }));
  const { error: assignmentError } = await supabaseAdmin.from("team_location_assignments").upsert(rows, { onConflict: "location_id,team_member_id,assignment_type" });
  if (assignmentError) throw assignmentError;

  const generatedNextAction = options.nextActionNote || (options.nextActionType ? labelize(options.nextActionType) : "Partner Launch follow-up");
  const updates: any = {
    sales_campaign: options.campaign || "partner_launch",
    partner_launch_selected: true,
    next_action_type: options.nextActionType || null,
    next_action: generatedNextAction,
    next_action_due_at: options.nextActionDueAt || null,
    updated_at: new Date().toISOString(),
  };
  if (options.tag === "launch_pilot") updates.partner_launch_pilot = true;
  try {
    const { data: current } = await supabaseAdmin.from("locations").select("id,partner_sales_status").in("id", cleanIds);
    const targetIds = (current || []).filter((row: any) => !row.partner_sales_status || row.partner_sales_status === "target").map((row: any) => row.id);
    await supabaseAdmin.from("locations").update(updates).in("id", cleanIds);
    if (targetIds.length) await supabaseAdmin.from("locations").update({ partner_sales_status: "needs_outreach" }).in("id", targetIds);
  } catch (error) {
    console.warn("Workspace assignment CRM field update skipped", error);
  }
  try {
    await supabaseAdmin.from("crm_notes").insert(cleanIds.map((location_id) => ({ location_id, note: options.notes || generatedNextAction, note_type: "workspace_assignment", created_by: options.assignedBy || null })));
  } catch {
    // Optional audit table may not exist in every deployment.
  }
  return { ok: true, count: cleanIds.length };
}
