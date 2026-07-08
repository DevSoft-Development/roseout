import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRole, type AdminRole } from "@/lib/users/roles";

const BETA_ADMIN_ROLES = new Set(["superadmin", "admin", "experience", "experience_team"]);

export async function getCurrentBetaContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let tester: any = null;
  let adminRole: AdminRole | null = null;
  if (user?.id || user?.email) {
    const or = [`user_id.eq.${user.id}`];
    if (user.email) or.push(`email.eq.${user.email}`);
    const { data } = await supabaseAdmin.from("beta_testers").select("*").or(or.join(",")).maybeSingle();
    tester = data ?? null;
    const { data: admin } = await supabaseAdmin.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
    const normalized = normalizeRole(admin?.role);
    if (typeof normalized === "string" && BETA_ADMIN_ROLES.has(normalized)) adminRole = normalized as AdminRole;
  }
  return { user, tester, isBetaTester: Boolean(tester && tester.status !== "removed"), isAdmin: Boolean(adminRole), isSuperadmin: adminRole === "superadmin", isExperienceTeam: adminRole === "experience" || adminRole === "experience_team", adminRole };
}

export async function isBetaTester() { return getCurrentBetaContext(); }
