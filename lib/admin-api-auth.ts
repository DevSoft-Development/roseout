import { createClient } from "@/lib/supabase-server";
import { isAdminRole, normalizeRole, type AdminRole } from "@/lib/users/roles";

export async function requireAdminApiRole(allowedRoles: AdminRole[]) {
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

  const normalizedRole = normalizeRole(adminUser?.role);

  if (
    adminError ||
    !adminUser ||
    !isAdminRole(normalizedRole) ||
    !allowedRoles.includes(normalizedRole)
  ) {
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
      role: normalizedRole,
    },
    supabase,
  };
}
