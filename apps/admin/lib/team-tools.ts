import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export async function getTeamProfileForUser(userId: string) {
  const { data, error } = await getAdminDatabaseClient()
    .from("team_member_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

export function canSearchAllWorkspaceLocations(userRole?: string | null) {
  return ["superadmin", "admin", "manager"].includes(String(userRole || "").toLowerCase());
}

export function hasBroadWorkspaceLocationAccess(profileOrRole?: any) {
  const role = typeof profileOrRole === "string"
    ? profileOrRole
    : profileOrRole?.team_type || profileOrRole?.role;
  return canSearchAllWorkspaceLocations(role);
}

export async function isWorkspaceLocationPermitted(profile: any, locationId: string) {
  const cleanLocationId = String(locationId || "").trim();
  if (!cleanLocationId) return false;

  if (hasBroadWorkspaceLocationAccess(profile)) {
    const { data } = await getAdminDatabaseClient()
      .from("locations")
      .select("id")
      .eq("id", cleanLocationId)
      .maybeSingle();
    return Boolean(data?.id);
  }

  const directIds = Array.isArray(profile?.assigned_location_ids)
    ? profile.assigned_location_ids.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  if (directIds.length) return directIds.includes(cleanLocationId);

  try {
    const { data: assignments, error } = await getAdminDatabaseClient()
      .from("team_location_assignments")
      .select("location_id")
      .eq("team_member_id", profile?.id)
      .eq("status", "active")
      .limit(1000);
    if (!error && assignments?.length) {
      return assignments.some((assignment: any) => String(assignment.location_id) === cleanLocationId);
    }
  } catch (error) {
    console.error("WORKSPACE_ASSIGNMENT_LOOKUP_FAILED", error);
  }
  return false;
}
