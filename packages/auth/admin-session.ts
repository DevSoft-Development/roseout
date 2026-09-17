import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./server-client";
import { normalizeAdminRole, type AdminRole } from "./admin-roles";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

type IdentityShape = {
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string | null }> | null;
};

function isMicrosoftIdentity(user: IdentityShape) {
  if (user.app_metadata?.provider === "azure") return true;
  return Boolean(user.identities?.some((identity) => identity.provider === "azure"));
}

export type CurrentAdmin = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
};

export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect("/admin/login");

  const adminDb = getAdminDatabaseClient();
  const { data: adminUser, error } = await adminDb
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = normalizeAdminRole(adminUser?.role);

  if (error || !adminUser || !role) redirect("/admin/unauthorized");

  if (role !== "superadmin" && !isMicrosoftIdentity(user)) {
    redirect("/admin/login?error=provider_required");
  }

  return {
    user_id: adminUser.user_id,
    email: user.email ?? null,
    full_name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null,
    role,
  };
});
