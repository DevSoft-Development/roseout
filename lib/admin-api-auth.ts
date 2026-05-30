import { createClient } from "@/lib/supabase-server";

type AdminRole = "admin" | "superadmin" | "editor" | "viewer";

function normalizeAdminRole(role: unknown): AdminRole | null {
  const normalized =
    role === "superuser" || role === "super_admin" ? "superadmin" : role;

  if (normalized === "admin" || normalized === "superadmin" || normalized === "editor" || normalized === "viewer") {
    return normalized;
  }

  return null;
}

export async function requireAdminApiRole(allowedRoles: readonly string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
      adminUser: null,
      supabase,
    };
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = normalizeAdminRole(adminUser?.role);

  if (adminError || !adminUser || !role || !allowedRoles.includes(role)) {
    return {
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
      adminUser: null,
      supabase,
    };
  }

  return {
    error: null,
    adminUser: {
      user_id: adminUser.user_id,
      email: user.email ?? null,
      full_name:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null,
      role,
    },
    supabase,
  };
}
