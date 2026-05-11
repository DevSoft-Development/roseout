import { createClient } from "@/lib/supabase-server";
import { getCurrentAdmin, type AdminRole } from "@/lib/admin-auth";

export async function requireAdminApiRole(allowedRoles: AdminRole[]) {
  const supabase = await createClient();

  try {
    const adminUser = await getCurrentAdmin();

    if (!allowedRoles.includes(adminUser.role)) {
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
  } catch {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
      adminUser: null,
      supabase,
    };
  }
}
