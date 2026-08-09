import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import { hasActiveOrganizationMembership } from "@/lib/organizations/context";

type LoginDestinationUser = {
  id: string;
  email?: string | null;
};

async function safeMaybeSingle(
  table: string,
  columns: string,
  column: string,
  value: string,
): Promise<{ data: any; error: any }> {
  try {
    return await supabaseAdmin
      .from(table)
      .select(columns)
      .eq(column, value)
      .maybeSingle();
  } catch (error) {
    console.error("safeMaybeSingle failed", { table, column, error });
    return { data: null, error };
  }
}

async function safeLimitOne(
  table: string,
  column: string,
  value: string,
): Promise<{ data: any[] | null; error: any }> {
  try {
    return await supabaseAdmin
      .from(table)
      .select("id")
      .eq(column, value)
      .limit(1);
  } catch (error) {
    console.error("safeLimitOne failed", { table, column, error });
    return { data: [], error };
  }
}

export async function resolveLoginDestination({
  user,
  intendedPath,
}: {
  user: LoginDestinationUser;
  intendedPath?: string | null;
}) {
  const safeIntendedPath = sanitizeIntendedPath(intendedPath);

  const adminRole = await getAdminLoginRole(supabaseAdmin as any, {
    id: user.id,
    email: user.email ?? null,
  });

  const [
    userProfileResult,
    usersTableResult,
    locationsResult,
    restaurantsResult,
    teamProfileResult,
    isOrganizationMember,
  ] = await Promise.all([
    safeMaybeSingle("user_profiles", "role, account_type", "id", user.id),
    safeMaybeSingle("users", "role, account_type", "id", user.id),
    safeLimitOne("locations", "owner_user_id", user.id),
    safeLimitOne("restaurants", "owner_user_id", user.id),
    safeMaybeSingle("team_member_profiles", "team_type, status", "user_id", user.id),
    hasActiveOrganizationMembership(user.id),
  ]);

  const isLocationOwner =
    Boolean(locationsResult.data?.length) ||
    Boolean(restaurantsResult.data?.length);

  const redirectTo = resolvePostLoginRedirect({
    adminRole,
    role: usersTableResult.data?.role || null,
    profileRole:
      userProfileResult.data?.role ||
      usersTableResult.data?.role ||
      null,
    profileAccountType:
      userProfileResult.data?.account_type ||
      usersTableResult.data?.account_type ||
      null,
    teamProfileTeamType:
      teamProfileResult.data?.status === "active"
        ? teamProfileResult.data?.team_type || null
        : null,
    isAdminUser: Boolean(adminRole),
    isLocationOwner,
    isOrganizationMember,
    intendedPath: safeIntendedPath,
  });

  return {
    redirectTo,
    adminRole,
    profileRole:
      userProfileResult.data?.role ||
      usersTableResult.data?.role ||
      null,
    profileAccountType:
      userProfileResult.data?.account_type ||
      usersTableResult.data?.account_type ||
      null,
    isLocationOwner,
    isOrganizationMember,
    debug: {
      userProfileError: userProfileResult.error
        ? String(userProfileResult.error)
        : null,
      usersTableError: usersTableResult.error
        ? String(usersTableResult.error)
        : null,
      locationsError: locationsResult.error
        ? String(locationsResult.error)
        : null,
      restaurantsError: restaurantsResult.error
        ? String(restaurantsResult.error)
        : null,
      teamProfileError: teamProfileResult.error
        ? String(teamProfileResult.error)
        : null,
    },
  };
}
