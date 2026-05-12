import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/admin-auth";

const ADMIN_ROLES: AdminRole[] = [
  "superuser",
  "admin",
  "editor",
  "reviewer",
  "viewer",
];

type ResolvedAdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
};

function normalizeAdminRole(role: unknown): AdminRole | null {
  if (role === "superadmin") {
    return "superuser";
  }

  return typeof role === "string" && ADMIN_ROLES.includes(role as AdminRole)
    ? (role as AdminRole)
    : null;
}

function metadataName(user: User) {
  const name = user.user_metadata?.full_name || user.user_metadata?.name;
  return typeof name === "string" ? name : null;
}

export async function resolveAdminUser(user: User) {
  const email = user.email?.toLowerCase();

  if (!email) {
    return null;
  }

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("id, email, full_name, role")
    .ilike("email", email)
    .maybeSingle();

  const adminRole = normalizeAdminRole(adminUser?.role);

  if (adminUser && adminRole) {
    return {
      id: adminUser.id,
      email: adminUser.email || email,
      full_name: adminUser.full_name || metadataName(user),
      role: adminRole,
    } satisfies ResolvedAdminUser;
  }

  const metadataRole = normalizeAdminRole(
    user.user_metadata?.role || user.app_metadata?.role
  );

  if (metadataRole) {
    return {
      id: user.id,
      email,
      full_name: metadataName(user),
      role: metadataRole,
    } satisfies ResolvedAdminUser;
  }

  let { data: appUser } = await supabaseAdmin
    .from("users")
    .select("id, email, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser) {
    const { data: appUserByEmail } = await supabaseAdmin
      .from("users")
      .select("id, email, role, is_superadmin")
      .ilike("email", email)
      .maybeSingle();

    appUser = appUserByEmail;
  }

  if (appUser?.is_superadmin) {
    return {
      id: appUser.id || user.id,
      email: appUser.email || email,
      full_name: metadataName(user),
      role: "superuser",
    } satisfies ResolvedAdminUser;
  }

  const appUserRole = normalizeAdminRole(appUser?.role);

  if (appUser && appUserRole) {
    return {
      id: appUser.id || user.id,
      email: appUser.email || email,
      full_name: metadataName(user),
      role: appUserRole,
    } satisfies ResolvedAdminUser;
  }

  return null;
}
