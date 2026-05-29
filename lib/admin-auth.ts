import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminRole, normalizeRole, type AdminRole } from "@/lib/users/roles";

type CurrentAdmin = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
};

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login");
  }

  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const normalizedRole = normalizeRole(adminUser?.role);

  if (error || !adminUser || !isAdminRole(normalizedRole)) {
    redirect("/login");
  }

  return {
    user_id: adminUser.user_id,
    email: user.email ?? null,
    full_name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null,
    role: normalizedRole,
  };
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}
