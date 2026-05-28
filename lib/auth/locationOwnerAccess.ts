import { createClient } from "@/lib/supabase-server";
import { getAdminLoginRole } from "@/lib/auth/get-login-destination";

export type OwnerAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  ownedLocationIds: string[];
  ownedSourceLocationIds: string[];
};

export async function getLocationOwnerAccess(userId: string): Promise<OwnerAccess> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const adminRole = user.user?.id === userId ? await getAdminLoginRole(supabase, user.user) : null;
  const isAdmin = Boolean(adminRole);
  const isSuperadmin = adminRole === "superadmin";

  const ownedLocationIds = new Set<string>();
  const ownedSourceLocationIds = new Set<string>();

  const [{ data: claims }, { data: mappings }, { data: directOwned }] = await Promise.all([
    supabase
      .from("business_claims")
      .select("location_id,source_location_id")
      .eq("user_id", userId)
      .in("status", ["approved", "verified", "active"]),
    supabase
      .from("location_owner_locations")
      .select("location_id,source_location_id")
      .eq("user_id", userId)
      .in("status", ["active", "approved", "verified"]),
    supabase.from("locations").select("id").eq("owner_user_id", userId),
  ]);

  for (const row of claims ?? []) {
    if (typeof row.location_id === "string") ownedLocationIds.add(row.location_id);
    if (typeof row.source_location_id === "string") ownedSourceLocationIds.add(row.source_location_id);
  }
  for (const row of mappings ?? []) {
    if (typeof row.location_id === "string") ownedLocationIds.add(row.location_id);
    if (typeof row.source_location_id === "string") ownedSourceLocationIds.add(row.source_location_id);
  }
  for (const row of directOwned ?? []) {
    if (typeof row.id === "string") ownedLocationIds.add(row.id);
  }

  return {
    isAdmin,
    isSuperadmin,
    ownedLocationIds: Array.from(ownedLocationIds),
    ownedSourceLocationIds: Array.from(ownedSourceLocationIds),
  };
}
