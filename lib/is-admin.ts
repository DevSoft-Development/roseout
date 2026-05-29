import { createClient } from "@/lib/supabase-browser";

function normalizeAdminRole(role: unknown) {
  if (role === "superuser" || role === "super_admin") return "superadmin";
  return role;
}

export async function isAdmin() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return false;

  const { data } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = normalizeAdminRole(data?.role);

  return role === "admin" || role === "superadmin";
}
