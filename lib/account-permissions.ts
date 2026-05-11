import "server-only";

import { createClient } from "@supabase/supabase-js";
import { ADMIN_DASHBOARD_ROLES, normalizeRole } from "@/lib/dashboard-permissions";

export type AccountIdentity = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

export type AdminDashboardAccess = {
  email: string;
  role: "superuser" | "admin";
  fullName: string | null;
};

export function serviceSupabase() {
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

function toAdminDashboardRole(role: unknown) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "superadmin" || normalizedRole === "super_admin") {
    return "superuser";
  }

  return ADMIN_DASHBOARD_ROLES.has(normalizedRole)
    ? (normalizedRole as "superuser" | "admin")
    : null;
}

export async function getAdminDashboardAccess(identity: AccountIdentity) {
  const email = identity.email?.trim().toLowerCase() || null;
  const userId = identity.id || null;
  const metadataAdminRole = toAdminDashboardRole(identity.role);
  const supabase = serviceSupabase();

  if (email) {
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("email, full_name, role")
      .eq("email", email)
      .maybeSingle();

    const adminUserRole = toAdminDashboardRole(adminUser?.role);

    if (adminUserRole) {
      return {
        email,
        role: adminUserRole,
        fullName: adminUser?.full_name || null,
      } satisfies AdminDashboardAccess;
    }
  }

  let userQuery = supabase
    .from("users")
    .select("email, full_name, role, is_superadmin")
    .limit(1);

  if (userId) {
    userQuery = userQuery.eq("id", userId);
  } else if (email) {
    userQuery = userQuery.eq("email", email);
  } else {
    return null;
  }

  const { data: users } = await userQuery;
  const appUser = users?.[0];
  const appUserRole = appUser?.is_superadmin
    ? "superuser"
    : toAdminDashboardRole(appUser?.role);

  if (appUserRole) {
    return {
      email: appUser?.email || email || "",
      role: appUserRole,
      fullName: appUser?.full_name || null,
    } satisfies AdminDashboardAccess;
  }

  if (metadataAdminRole && email) {
    return {
      email,
      role: metadataAdminRole,
      fullName: null,
    } satisfies AdminDashboardAccess;
  }

  return null;
}
