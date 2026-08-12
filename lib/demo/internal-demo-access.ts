import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRole } from "@/lib/users/roles";

export const INTERNAL_DEMO_ROLES = new Set([
  "superadmin",
  "admin",
  "ambassador",
  "partner_ambassador",
  "experience",
]);

export function isInternalDemoRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return Boolean(normalized && INTERNAL_DEMO_ROLES.has(normalized));
}

export async function getInternalDemoViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return null;

  const [{ data: adminUser }, { data: userProfile }] = await Promise.all([
    supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseAdmin.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const role = normalizeRole(adminUser?.role || userProfile?.role);
  if (!role || !INTERNAL_DEMO_ROLES.has(role)) return null;

  return { user, role };
}

export async function hasInternalDemoAccess() {
  return Boolean(await getInternalDemoViewer());
}
