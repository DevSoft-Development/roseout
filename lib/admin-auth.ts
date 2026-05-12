import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { resolveAdminUser } from "@/lib/admin-user";

export type AdminRole =
  | "superuser"
  | "admin"
  | "editor"
  | "reviewer"
  | "viewer";

export async function getCurrentAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const adminUser = await resolveAdminUser(user);

  if (!adminUser) {
    redirect("/login");
  }

  return adminUser;
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role as AdminRole)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}