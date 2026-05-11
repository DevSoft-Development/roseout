import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminRole =
  | "superuser"
  | "admin"
  | "editor"
  | "reviewer"
  | "viewer";

type ProfileRole = string | null | undefined;

type CurrentAdmin = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
};

const validAdminRoles: AdminRole[] = [
  "superuser",
  "admin",
  "editor",
  "reviewer",
  "viewer",
];

function normalizeAdminRole(role: ProfileRole): AdminRole | null {
  const normalized = String(role || "").toLowerCase();

  if (normalized === "superadmin") return "superuser";
  if (validAdminRoles.includes(normalized as AdminRole)) {
    return normalized as AdminRole;
  }

  return null;
}

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const email = user.email.toLowerCase();

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("id, email, full_name, role")
    .eq("email", email)
    .maybeSingle();

  const adminRole = normalizeAdminRole(adminUser?.role);

  if (adminUser && adminRole) {
    return {
      id: adminUser.id,
      email: adminUser.email || email,
      full_name: adminUser.full_name || null,
      role: adminRole,
    };
  }

  const metadataRole =
    normalizeAdminRole(user.user_metadata?.role as ProfileRole) ||
    normalizeAdminRole(user.app_metadata?.role as ProfileRole);

  if (metadataRole || user.user_metadata?.is_superadmin || user.app_metadata?.is_superadmin) {
    return {
      id: user.id,
      email,
      full_name: (user.user_metadata?.full_name as string | undefined) || null,
      role: metadataRole || "superuser",
    };
  }

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("id, email, full_name, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  const profileRole = normalizeAdminRole(profile?.role);

  if (profileRole || profile?.is_superadmin) {
    return {
      id: profile?.id || user.id,
      email: profile?.email || email,
      full_name: profile?.full_name || null,
      role: profileRole || "superuser",
    };
  }

  redirect("/login");
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}
