import { createClient } from "@/lib/supabase-browser";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

export async function isAdmin() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return false;

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return isAdminRole(normalizeRole(adminUser?.role));
}
