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

export type AssignableTeamMember = {
  id: string;
  user_id: string;
  team_type: string | null;
  status: string | null;
  display_name: string;
  email: string | null;
};

export async function listAssignableTeamMembers(): Promise<AssignableTeamMember[]> {
  const { data, error } = await supabaseAdmin
    .from("team_member_profiles")
    .select("id,user_id,team_type,status")
    .in("status", ["active", "training"])
    .order("team_type", { ascending: true });

  if (error) {
    throw error;
  }

  const profiles = Array.isArray(data) ? data : [];

  const usersById = await listUsersById(
    profiles
      .map((profile: any) => String(profile.user_id || "").trim())
      .filter(Boolean),
  );

  return profiles.map((profile: any) => {
    const userId = String(profile.user_id || "").trim();
    const user = usersById.get(userId);

    return {
      id: String(profile.id),
      user_id: userId,
      team_type: profile.team_type || null,
      status: profile.status || null,
      display_name:
        user?.full_name ||
        user?.email ||
        `${labelize(profile.team_type || "Team")} Member`,
      email: user?.email || null,
    };
  });
}

export type AssignLocationsOptions = {
  assignedBy?: string | null;
  assignmentType?: string | null;
  campaign?: string | null;
  priority?: string | null;
  reason?: string | null;
  notes?: string | null;
  tag?: string | null;
  nextActionType?: string | null;
  nextActionNote?: string | null;
  nextActionDueAt?: string | null;
};

export async function assignLocationsToWorkspaceUser(
  locationIds: string[],
  assignedTo: string | null,
  options: AssignLocationsOptions = {},
) {
  const cleanLocationIds = Array.from(
    new Set(
      (Array.isArray(locationIds) ? locationIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );

  if (!cleanLocationIds.length) {
    throw new Error("Select at least one location to assign.");
  }

  const cleanAssignedTo = String(assignedTo || "").trim();

  if (!cleanAssignedTo) {
    throw new Error("Choose a team member to assign these locations to.");
  }

  const { data: teamMember, error: teamMemberError } = await supabaseAdmin
    .from("team_member_profiles")
    .select("id,user_id,status,team_type")
    .eq("id", cleanAssignedTo)
    .maybeSingle();

  if (teamMemberError) {
    throw teamMemberError;
  }

  if (!teamMember?.id) {
    throw new Error("The selected team member could not be found.");
  }

  const assignmentType =
    String(options.assignmentType || "partner_launch").trim() || "partner_launch";

  const campaign =
    String(options.campaign || "partner_launch").trim() || "partner_launch";

  const priority =
    String(options.priority || "normal").trim() || "normal";

  const now = new Date().toISOString();
  const savedRows: any[] = [];

  for (const locationId of cleanLocationIds) {
    const row = {
      location_id: locationId,
      team_member_id: String(teamMember.id),
      assigned_by: options.assignedBy || null,
      assignment_type: assignmentType,
      priority,
      status: "active",
      reason: options.reason || null,
      notes: options.notes || null,
      campaign,
      next_action_type: options.nextActionType || null,
      next_action_note: options.nextActionNote || null,
      next_action_due_at: options.nextActionDueAt || null,
      updated_at: now,
    };

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("team_location_assignments")
      .select("id")
      .eq("location_id", row.location_id)
      .eq("team_member_id", row.team_member_id)
      .eq("assignment_type", row.assignment_type)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing?.id) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("team_location_assignments")
        .update(row)
        .eq("id", existing.id)
        .select("id,location_id,team_member_id,assignment_type,status")
        .single();

      if (updateError) {
        throw updateError;
      }

      savedRows.push(updated);
      continue;
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from("team_location_assignments")
      .insert({
        ...row,
        created_at: now,
      })
      .select("id,location_id,team_member_id,assignment_type,status")
      .single();

    if (insertError) {
      throw insertError;
    }

    savedRows.push(created);
  }

  return {
    success: true,
    count: savedRows.length,
    assignedTo: String(teamMember.id),
    assignmentType,
    rows: savedRows,
  };
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


const WORKSPACE_LOCATION_SEARCH_COLUMNS =
  "id,name,location_name,restaurant_name,activity_name,address,city,state,borough,neighborhood,category,location_type,cuisine_type,activity_type,phone,phone_number,contact_phone,website,instagram,owner_instagram,claim_status,claim_outreach_status,partner_sales_status,reservation_portal_status,reservation_embed_status,discovery_profile_status,plan_status,updated_at,created_at";

function workspaceLocationSearchMatches(row: any, query: string) {
  const clean = String(query || "").trim().toLowerCase();
  if (!clean) return true;

  return [
    row.name,
    row.location_name,
    row.restaurant_name,
    row.activity_name,
    row.address,
    row.city,
    row.state,
    row.borough,
    row.neighborhood,
    row.category,
    row.location_type,
    row.cuisine_type,
    row.activity_type,
    row.phone,
    row.phone_number,
    row.contact_phone,
    row.website,
    row.instagram,
    row.owner_instagram,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(clean);
}

function workspaceLocationDisplayName(row: any) {
  return (
    row.name ||
    row.location_name ||
    row.restaurant_name ||
    row.activity_name ||
    "Untitled location"
  );
}

function workspaceLocationDisplayPhone(row: any) {
  return row.phone || row.phone_number || row.contact_phone || null;
}

function workspaceLocationDisplayCategory(row: any) {
  return row.category || row.cuisine_type || row.activity_type || row.location_type || null;
}

function applyWorkspaceLocationMemoryFilters(rows: any[], filters: Record<string, any>) {
  let filtered = rows;

  if (filters.partnerSalesStatus && filters.partnerSalesStatus !== "all") {
    filtered = filtered.filter((row) => row.partner_sales_status === filters.partnerSalesStatus);
  }

  if (filters.claimOutreachStatus && filters.claimOutreachStatus !== "all") {
    filtered = filtered.filter((row) => row.claim_outreach_status === filters.claimOutreachStatus);
  }

  if (filters.reservationPortalStatus && filters.reservationPortalStatus !== "all") {
    filtered = filtered.filter((row) => row.reservation_portal_status === filters.reservationPortalStatus);
  }

  if (filters.reservationEmbedStatus && filters.reservationEmbedStatus !== "all") {
    filtered = filtered.filter((row) => row.reservation_embed_status === filters.reservationEmbedStatus);
  }

  if (filters.discoveryProfileStatus && filters.discoveryProfileStatus !== "all") {
    filtered = filtered.filter((row) => row.discovery_profile_status === filters.discoveryProfileStatus);
  }

  if (filters.planStatus && filters.planStatus !== "all") {
    filtered = filtered.filter((row) => row.plan_status === filters.planStatus);
  }

  return filtered;
}

export function canSearchAllWorkspaceLocations(userRole?: string | null) {
  return ["superadmin", "admin", "manager"].includes(String(userRole || "").toLowerCase());
}

export async function getWorkspaceLocationSearchScope(userId: string, role?: string | null, profile?: any) {
  const currentProfile = profile || (await getTeamProfileForUser(userId));
  const normalizedRole = String(role || currentProfile?.team_type || "").toLowerCase();

  return {
    all: canSearchAllWorkspaceLocations(normalizedRole) || currentProfile?.team_type === "superadmin",
    profile: currentProfile,
  };
}

export async function searchWorkspaceLocationsForUser(
  userId: string,
  role: string | null | undefined,
  query: string,
  filters: Record<string, any> = {},
) {
  const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 100);
  const scope = await getWorkspaceLocationSearchScope(userId, role);
  const q = String(query || "").trim();
  const selectCols = filters.columns || WORKSPACE_LOCATION_SEARCH_COLUMNS;

  let rows: any[] = [];

  if (scope.all) {
    let dbq = supabaseAdmin.from("locations").select(selectCols).limit(limit * 3);

    if (q) {
      const escaped = q.replace(/[%_,]/g, " ");
      dbq = dbq.or(
        [
          `name.ilike.%${escaped}%`,
          `location_name.ilike.%${escaped}%`,
          `restaurant_name.ilike.%${escaped}%`,
          `activity_name.ilike.%${escaped}%`,
          `address.ilike.%${escaped}%`,
          `city.ilike.%${escaped}%`,
          `borough.ilike.%${escaped}%`,
          `neighborhood.ilike.%${escaped}%`,
          `category.ilike.%${escaped}%`,
          `phone.ilike.%${escaped}%`,
        ].join(","),
      );
    }

    if (filters.partnerSalesStatus && filters.partnerSalesStatus !== "all") {
      dbq = dbq.eq("partner_sales_status", filters.partnerSalesStatus);
    }

    if (filters.claimOutreachStatus && filters.claimOutreachStatus !== "all") {
      dbq = dbq.eq("claim_outreach_status", filters.claimOutreachStatus);
    }

    if (filters.reservationPortalStatus && filters.reservationPortalStatus !== "all") {
      dbq = dbq.eq("reservation_portal_status", filters.reservationPortalStatus);
    }

    if (filters.reservationEmbedStatus && filters.reservationEmbedStatus !== "all") {
      dbq = dbq.eq("reservation_embed_status", filters.reservationEmbedStatus);
    }

    if (filters.discoveryProfileStatus && filters.discoveryProfileStatus !== "all") {
      dbq = dbq.eq("discovery_profile_status", filters.discoveryProfileStatus);
    }

    if (filters.planStatus && filters.planStatus !== "all") {
      dbq = dbq.eq("plan_status", filters.planStatus);
    }

    const { data, error } = await dbq.order("updated_at", { ascending: false });

    if (!error) {
      rows = data || [];
    }
  } else {
    rows = await listPermittedWorkspaceLocations(scope.profile, selectCols, 1000);
    rows = rows.filter((row) => workspaceLocationSearchMatches(row, q));
    rows = applyWorkspaceLocationMemoryFilters(rows, filters);
  }

  return rows.slice(0, limit).map((row) => ({
    ...row,
    display_name: workspaceLocationDisplayName(row),
    display_phone: workspaceLocationDisplayPhone(row),
    display_category: workspaceLocationDisplayCategory(row),
  }));
}
