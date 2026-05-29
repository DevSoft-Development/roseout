import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AdminRole = "admin" | "superadmin" | "editor" | "viewer";

function normalizeAdminRole(role: unknown): AdminRole | null {
  const normalized =
    role === "superuser" || role === "super_admin" ? "superadmin" : role;

  if (
    normalized === "admin" ||
    normalized === "superadmin" ||
    normalized === "editor" ||
    normalized === "viewer"
  ) {
    return normalized;
  }

  return null;
}

export async function getCurrentAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login");
  }

  const { data: adminUser, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = normalizeAdminRole(adminUser?.role);

  if (error || !adminUser || !role) {
    redirect("/login");
  }

  return {
    user_id: adminUser.user_id,
    email: user.email ?? null,
    full_name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null,
    role,
  };
}

export async function requireAdminRole(allowedRoles: readonly string[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}
