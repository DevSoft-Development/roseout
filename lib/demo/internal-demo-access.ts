import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { ADMIN_DEMO_HANDOFF_COOKIE, verifyAdminDemoHandoff } from "@theouthaven/auth/admin-demo-handoff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRole } from "@/lib/users/roles";

export const INTERNAL_DEMO_ROLES = new Set([
  "superadmin",
  "admin",
  "ambassador",
  "partner_ambassador",
  "experience",
  "experience_team",
]);

export function isInternalDemoRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return Boolean(normalized && INTERNAL_DEMO_ROLES.has(normalized));
}

async function signedDemoViewer() {
  try {
    const cookieStore = await cookies();
    const payload = verifyAdminDemoHandoff(cookieStore.get(ADMIN_DEMO_HANDOFF_COOKIE)?.value);
    const role = normalizeRole(payload?.role);
    if (!payload || !role || !INTERNAL_DEMO_ROLES.has(role)) return null;
    return {
      user: { id: payload.userId, email: null },
      role,
      demoHandoff: {
        locationId: payload.locationId,
        type: payload.type,
        expiresAt: payload.exp,
      },
    };
  } catch {
    return null;
  }
}

export async function getInternalDemoViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = normalizeRole(adminUser?.role);
    if (role && INTERNAL_DEMO_ROLES.has(role)) return { user, role };
  }

  return signedDemoViewer();
}

export async function hasInternalDemoAccess() {
  return Boolean(await getInternalDemoViewer());
}
