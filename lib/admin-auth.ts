import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

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

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

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