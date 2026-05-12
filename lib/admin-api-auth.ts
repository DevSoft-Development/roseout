import { createClient } from "@/lib/supabase-server";
import { resolveAdminUser } from "@/lib/admin-user";
import type { AdminRole } from "@/lib/admin-auth";

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

  const adminUser = await resolveAdminUser(user);

  if (!adminUser || !allowedRoles.includes(adminUser.role as AdminRole)) {
    return {
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
      adminUser: null,
      supabase,
    };
  }

  return {
    error: null,
    adminUser,
    supabase,
  };
}