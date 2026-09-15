import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRole } from "@/lib/users/roles";

export const INTERNAL_DEMO_ROLES = new Set([
  "superadmin",
  "admin",
  "manager",
  "editor",
  "reviewer",
  "ambassador",
  "partner_ambassador",
  "experience",
  "experience_team",
  "marketing_intern",
  "marketing_specialist",
  "marketing_manager",
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

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = normalizeRole(adminUser?.role);
  if (!role || !INTERNAL_DEMO_ROLES.has(role)) return null;

  return { user, role };
}

export async function hasInternalDemoAccess() {
  return Boolean(await getInternalDemoViewer());
}
