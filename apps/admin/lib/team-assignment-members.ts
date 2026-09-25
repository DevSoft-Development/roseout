import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type AssignableTeamMember = {
  id: string;
  profile_id: string | null;
  user_id: string;
  team_type: string | null;
  department: string;
  status: string | null;
  display_name: string;
  email: string | null;
};

function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function listAssignableTeamMembers(): Promise<AssignableTeamMember[]> {
  const adminDb = getAdminDatabaseClient();

  const [{ data: profiles, error: profileError }, { data: adminRows, error: adminError }, authResult] =
    await Promise.all([
      adminDb
        .from("team_member_profiles")
        .select("id,user_id,team_type,status")
        .in("status", ["active", "training"])
        .order("team_type", { ascending: true }),
      adminDb
        .from("admin_users")
        .select("user_id,role,email,full_name")
        .neq("role", "disabled")
        .order("role", { ascending: true }),
      adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (profileError) throw profileError;
  if (adminError) throw adminError;
  if (authResult.error) throw authResult.error;

  const profileRows = Array.isArray(profiles) ? profiles : [];
  const adminUsers = Array.isArray(adminRows) ? adminRows : [];
  const authById = new Map((authResult.data?.users || []).map((user) => [user.id, user]));
  const adminByUserId = new Map(adminUsers.map((row) => [String(row.user_id), row]));
  const profileByUserId = new Map(profileRows.map((row) => [String(row.user_id), row]));
  const userIds = new Set<string>([
    ...profileRows.map((row) => String(row.user_id || "")).filter(Boolean),
    ...adminUsers.map((row) => String(row.user_id || "")).filter(Boolean),
  ]);

  const members: AssignableTeamMember[] = [];

  for (const userId of userIds) {
    const profile = profileByUserId.get(userId);
    const admin = adminByUserId.get(userId);
    const authUser = authById.get(userId);
    if (authUser?.deleted_at) continue;

    const email = String(
      authUser?.email ||
        admin?.email ||
        "",
    ).trim() || null;

    const displayName = String(
      authUser?.user_metadata?.full_name ||
        authUser?.user_metadata?.name ||
        admin?.full_name ||
        email ||
        `${labelize(profile?.team_type || admin?.role || "Team")} Member`,
    ).trim();

    const department = labelize(profile?.team_type || admin?.role || "Team");

    members.push({
      id: profile?.id ? String(profile.id) : `admin:${userId}`,
      profile_id: profile?.id ? String(profile.id) : null,
      user_id: userId,
      team_type: profile?.team_type || admin?.role || null,
      department,
      status: profile?.status || (admin ? "active" : null),
      display_name: displayName,
      email,
    });
  }

  return members.sort(
    (left, right) =>
      left.department.localeCompare(right.department) ||
      left.display_name.localeCompare(right.display_name),
  );
}
