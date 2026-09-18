import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type AssignableTeamMember = {
  id: string;
  user_id: string;
  team_type: string | null;
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
  const { data, error } = await adminDb
    .from("team_member_profiles")
    .select("id,user_id,team_type,status")
    .in("status", ["active", "training"])
    .order("team_type", { ascending: true });

  if (error) throw error;

  const profiles = Array.isArray(data) ? data : [];
  const userIds = profiles
    .map((profile) => String(profile.user_id || "").trim())
    .filter(Boolean);

  const unique = Array.from(new Set(userIds));
  const usersById = new Map<
    string,
    { email: string | null; full_name: string | null }
  >();

  if (unique.length) {
    const { data: authData } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    for (const user of authData?.users || []) {
      if (!unique.includes(user.id)) continue;
      usersById.set(user.id, {
        email: user.email ?? null,
        full_name:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : null,
      });
    }
  }

  return profiles.map((profile) => {
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
