import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

export const ADMIN_DASHBOARD_PATH = "/admin/dashboard";
export const LOCATION_DASHBOARD_PATH = "/locations/dashboard";
export const USER_DASHBOARD_PATH = "/user/dashboard";
export const DEFAULT_LOGIN_REDIRECT_PATH = "/create";

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
  "restaurants",
  "restaurant",
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
  const metadataRole = normalizeRole(user.user_metadata?.role);

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

  if (LOCATION_OWNER_ROLES.has(metadataRole) || (await hasOwnedLocation(user.id, email))) {
    return LOCATION_DASHBOARD_PATH;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile || metadataRole === "user") {
    return USER_DASHBOARD_PATH;
  }

  return DEFAULT_LOGIN_REDIRECT_PATH;
}
