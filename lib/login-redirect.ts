import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import {
  LOCATION_OWNER_ROLES,
  normalizeRole,
  roleSetHas,
} from "@/lib/dashboard-permissions";
import { getAdminDashboardAccess } from "@/lib/account-permissions";

export const ADMIN_DASHBOARD_PATH = "/admin/dashboard";
export const LOCATION_DASHBOARD_PATH = "/locations/dashboard";
export const USER_DASHBOARD_PATH = "/user/dashboard";
export const DEFAULT_LOGIN_REDIRECT_PATH = USER_DASHBOARD_PATH;

const PUBLIC_LOGIN_REDIRECT_BLOCKLIST = new Set([
  "/",
  "/create",
  "/login",
  "/signup",
]);

function normalizeRequestedPath(path?: string | null) {
  if (!path || typeof path !== "string") return null;

  const trimmedPath = path.trim();
  if (!trimmedPath || trimmedPath.startsWith("//")) return null;

  try {
    const parsedUrl = new URL(trimmedPath, "https://theouthaven.local");

    if (parsedUrl.origin !== "https://theouthaven.local") {
      return null;
    }

    const normalizedPath = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

    if (PUBLIC_LOGIN_REDIRECT_BLOCKLIST.has(pathname)) {
      return null;
    }

    return normalizedPath;
  } catch {
    return null;
  }
}

function pathIsWithinDashboard(path: string, dashboardPath: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === dashboardPath || pathname.startsWith(`${dashboardPath}/`);
}

export function resolveRoleSafeRedirect({
  roleDashboardPath,
  requestedPath,
}: {
  roleDashboardPath: string;
  requestedPath?: string | null;
}) {
  const normalizedRequestedPath = normalizeRequestedPath(requestedPath);

  if (
    normalizedRequestedPath &&
    pathIsWithinDashboard(normalizedRequestedPath, roleDashboardPath)
  ) {
    return normalizedRequestedPath;
  }

  return roleDashboardPath;
}

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

export async function resolveLoginRedirect(
  user: User,
  requestedPath?: string | null
) {
  const email = user.email?.trim().toLowerCase() || null;
  const roles = getUserRoles(user);

  const adminAccess = await getAdminDashboardAccess({
    id: user.id,
    email,
    role: Array.from(roles).find(Boolean) || null,
  });

  if (adminAccess) {
    return resolveRoleSafeRedirect({
      roleDashboardPath: ADMIN_DASHBOARD_PATH,
      requestedPath,
    });
  }

  if (
    roleSetHas(roles, LOCATION_OWNER_ROLES) ||
    (await hasOwnedLocation(user.id, email))
  ) {
    return resolveRoleSafeRedirect({
      roleDashboardPath: LOCATION_DASHBOARD_PATH,
      requestedPath,
    });
  }

  return resolveRoleSafeRedirect({
    roleDashboardPath: USER_DASHBOARD_PATH,
    requestedPath,
  });
}
