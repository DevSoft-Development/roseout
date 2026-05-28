import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { ADMIN_ROLES, isAdminRole, normalizeRole, type AdminRole } from "@/lib/users/roles";

type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
};

export { ADMIN_ROLES, isAdminRole, type AdminRole };

export async function getCurrentAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const { data: adminUserById } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: adminUserByEmail } = adminUserById
    ? { data: null }
    : await supabase
        .from("admin_users")
        .select("id, email, full_name, role")
        .eq("email", user.email.toLowerCase())
        .maybeSingle();

  const adminUser = adminUserById ?? adminUserByEmail;
  const normalizedRole = normalizeRole(adminUser?.role);

  if (!adminUser || !isAdminRole(normalizedRole)) {
    redirect("/login");
  }

  return {
    ...adminUser,
    role: normalizedRole,
  } satisfies AdminUser;
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}
