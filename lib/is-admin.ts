import { createClient } from "@/lib/supabase-browser";
import { isAdminRole } from "@/lib/users/roles";

export async function isAdmin() {
  const supabase = createClient();

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();

  const userId = data.user?.id;

  if (!email || !userId) return false;

  const { data: adminUserById } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: adminUserByEmail } = adminUserById
    ? { data: null }
    : await supabase
        .from("admin_users")
        .select("role")
        .eq("email", email)
        .maybeSingle();

  return isAdminRole((adminUserById ?? adminUserByEmail)?.role);
}
