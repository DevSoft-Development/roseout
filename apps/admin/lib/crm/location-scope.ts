import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

function broadAccess(role: string, profile: any) {
  return ["superadmin", "admin", "manager"].includes(String(role || "").toLowerCase())
    || ["superadmin", "admin", "manager"].includes(String(profile?.team_type || "").toLowerCase());
}

export async function listPermittedCrmLocationIds(userId: string, role: string) {
  const db = getAdminDatabaseClient();
  const { data: profile, error } = await db
    .from("team_member_profiles")
    .select("id,team_type,assigned_location_ids")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (broadAccess(role, profile)) return null;

  const direct = Array.isArray(profile?.assigned_location_ids)
    ? profile.assigned_location_ids.map((value: unknown) => String(value || "").trim()).filter(Boolean)
    : [];
  if (direct.length) return direct;
  if (!profile?.id) return [];

  const { data: assignments, error: assignmentError } = await db
    .from("team_location_assignments")
    .select("location_id")
    .eq("team_member_id", profile.id)
    .eq("status", "active")
    .limit(2000);
  if (assignmentError) throw assignmentError;
  return (assignments || []).map((row: any) => String(row.location_id || "")).filter(Boolean);
}
