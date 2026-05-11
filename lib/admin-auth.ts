import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getAppSession } from "@/lib/app-session";
import { getAdminDashboardAccess } from "@/lib/account-permissions";

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

  const appSession = await getAppSession();
  const adminAccess = await getAdminDashboardAccess({
    id: user?.id || appSession?.id || null,
    email: user?.email || appSession?.email || null,
    role: user?.user_metadata?.role || appSession?.role || null,
  });

  if (!adminAccess) {
    redirect("/login");
  }

  return {
    id: user?.id || appSession?.id || adminAccess.email,
    email: adminAccess.email,
    full_name: adminAccess.fullName,
    role: adminAccess.role,
  };
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role as AdminRole)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}