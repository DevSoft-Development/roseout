import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

export const ADMIN_DASHBOARD_PATH = "/admin/dashboard";
export const LOCATION_DASHBOARD_PATH = "/locations/dashboard";
export const USER_DASHBOARD_PATH = "/user/dashboard";
export const DEFAULT_LOGIN_REDIRECT_PATH = USER_DASHBOARD_PATH;

const ADMIN_ROLES = new Set([
  "superuser",
  "admin",
  "editor",
  "reviewer",
  "viewer",
]);

const LOCATION_OWNER_ROLES = new Set([
  "location_owner",
  "location-owner",
  "locations",
  "location",
  "restaurants",
  "restaurant",
  "activity_owner",
  "activity-owner",
  "owner",
]);

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function normalizeRole(role: unknown) {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

function getUserRoles(user: User) {
  return new Set(
    [
      user.user_metadata?.role,
      user.user_metadata?.user_role,
      user.user_metadata?.account_type,
      user.app_metadata?.role,
      user.app_metadata?.user_role,
      user.app_metadata?.account_type,
    ]
      .map(normalizeRole)
      .filter(Boolean)
  );
}

function hasRole(roles: Set<string>, allowedRoles: Set<string>) {
  return Array.from(roles).some((role) => allowedRoles.has(role));
}

async function hasOwnedLocation(userId: string, email?: string | null) {
  const supabase = adminSupabase();

  for (const table of ["restaurants", "activities"] as const) {
    const { data: ownedById } = await supabase
      .from(table)
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1);

    if (ownedById?.length) {
      return true;
    }

    if (email) {
      const { data: ownedByEmail } = await supabase
        .from(table)
        .select("id")
        .ilike("owner_email", email)
        .limit(1);

      if (ownedByEmail?.length) {
        return true;
      }
    }
  }

  return false;
}

export async function resolveLoginRedirect(user: User) {
  const supabase = adminSupabase();
  const email = user.email?.trim().toLowerCase() || null;
  const roles = getUserRoles(user);

  if (hasRole(roles, ADMIN_ROLES)) {
    return ADMIN_DASHBOARD_PATH;
  }

  if (email) {
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();

    if (ADMIN_ROLES.has(normalizeRole(adminUser?.role))) {
      return ADMIN_DASHBOARD_PATH;
    }
  }

  if (hasRole(roles, LOCATION_OWNER_ROLES) || (await hasOwnedLocation(user.id, email))) {
    return LOCATION_DASHBOARD_PATH;
  }

  return USER_DASHBOARD_PATH;
}
