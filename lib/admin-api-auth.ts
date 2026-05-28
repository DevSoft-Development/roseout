import { createClient } from "@/lib/supabase-server";
import { isAdminRole, normalizeRole, type AdminRole } from "@/lib/users/roles";

export async function requireAdminApiRole(allowedRoles: AdminRole[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
      adminUser: null,
      supabase,
    };
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  const normalizedRole = normalizeRole(adminUser?.role);

  if (!adminUser || !isAdminRole(normalizedRole) || !allowedRoles.includes(normalizedRole)) {
    return {
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
      adminUser: null,
      supabase,
    };
  }

  return {
    error: null,
    adminUser: {
      ...adminUser,
      role: normalizedRole,
    },
    supabase,
  };
}
