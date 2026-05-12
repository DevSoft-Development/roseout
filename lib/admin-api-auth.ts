import { createClient } from "@/lib/supabase-server";
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

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

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