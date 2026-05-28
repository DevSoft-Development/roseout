import { createClient } from "@/lib/supabase-browser";
import { isAdminRole } from "@/lib/users/roles";

export async function isAdmin() {
  const supabase = createClient();

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();

  if (!email) return false;

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  return isAdminRole(adminUser?.role);
}
