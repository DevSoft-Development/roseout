import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/users/roles";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

function normalizeAdminRole(role: unknown): AdminRole | null {
  if (typeof role !== "string") return null;
  const normalized = normalizeRole(role);
  return isAdminRole(normalized) ? normalized : null;
}

export async function getCurrentAdmin(): Promise<{
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
}> {
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

export async function requireAdminRole(allowedRoles: readonly AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}
