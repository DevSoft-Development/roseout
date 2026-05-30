import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_ROLES, normalizeRole } from "@/lib/users/roles";

export type OwnerAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  ownedLocationIds: string[];
  ownedSourceLocationIds: string[];
};

export function hasOwnerAccessToLocation(
  access: OwnerAccess,
  location: {
    id?: string | null;
    source_id?: string | null;
    source_location_id?: string | null;
  } | null | undefined,
) {
  if (access.isAdmin) return true;
  if (!location) return false;

  const canonicalId = typeof location.id === "string" ? location.id : null;
  const sourceId =
    typeof location.source_id === "string"
      ? location.source_id
      : typeof location.source_location_id === "string"
        ? location.source_location_id
        : null;

  return Boolean(
    (canonicalId &&
      (access.ownedLocationIds.includes(canonicalId) ||
        access.ownedSourceLocationIds.includes(canonicalId))) ||
      (sourceId &&
        (access.ownedSourceLocationIds.includes(sourceId) ||
          access.ownedLocationIds.includes(sourceId))),
  );
}

export async function getLocationOwnerAccess(userId: string): Promise<OwnerAccess> {
  const [{ data: userProfile }, { data: adminUser }] = await Promise.all([
    supabaseAdmin.from("users").select("role").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("admin_users").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  const profileRole = normalizeRole(
    typeof userProfile?.role === "string" ? userProfile.role.trim().toLowerCase() : null,
  );
  const adminRole = normalizeRole(
    typeof adminUser?.role === "string" ? adminUser.role.trim().toLowerCase() : null,
  );
  const isAdmin =
    (ADMIN_ROLES as readonly string[]).includes(profileRole || "") ||
    (ADMIN_ROLES as readonly string[]).includes(adminRole || "");
  const isSuperadmin = profileRole === "superadmin" || adminRole === "superadmin";

  const ownedLocationIds = new Set<string>();
  const ownedSourceLocationIds = new Set<string>();

  const [{ data: claims }, { data: mappings }, { data: directOwned }] = await Promise.all([
    supabaseAdmin
      .from("business_claims")
      .select("location_id,source_location_id")
      .eq("user_id", userId)
      .eq("status", "approved"),
    supabaseAdmin
      .from("location_owner_locations")
      .select("location_id,source_location_id")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabaseAdmin
      .from("locations")
      .select("id,source_id,claim_status,is_claimed,claimed")
      .eq("owner_user_id", userId)
      .in("claim_status", ["approved", "claimed", "redeemed"]),
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
    if (typeof row.source_id === "string") ownedSourceLocationIds.add(row.source_id);
  }

  return {
    isAdmin,
    isSuperadmin,
    ownedLocationIds: Array.from(ownedLocationIds),
    ownedSourceLocationIds: Array.from(ownedSourceLocationIds),
  };
}
