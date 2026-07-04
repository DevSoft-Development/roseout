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

export type OwnerLocationAccessResult = {
  userId: string;
  access: OwnerAccess;
  location: Record<string, any>;
};

export function sanitizeOwnerLocationResponse(row: Record<string, any> | null | undefined) {
  if (!row) return null;
  const allowed = [
    "id","source_id","source_location_id","source_table","name","location_name","restaurant_name","activity_name","address","city","state","zip","phone","website","instagram","category","cuisine_type","activity_type","description","hours","operating_hours","reservation_url","subscription_plan","subscription_status","plan","is_pro","updated_at",
  ];
  return Object.fromEntries(allowed.filter((key) => key in row).map((key) => [key, row[key]]));
}

export async function requireOwnerAccessToLocation(userId: string, locationId: string): Promise<OwnerLocationAccessResult | null> {
  const cleanLocationId = String(locationId || "").trim();
  if (!userId || !cleanLocationId) return null;
  const access = await getLocationOwnerAccess(userId);
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .or(`id.eq.${cleanLocationId},source_id.eq.${cleanLocationId},source_location_id.eq.${cleanLocationId}`)
    .maybeSingle();
  if (!location || !hasOwnerAccessToLocation(access, location)) return null;
  return { userId, access, location: location as Record<string, any> };
}

export async function requireOwnerOrAdminAccessToLocation(userId: string, locationId: string): Promise<OwnerLocationAccessResult | null> {
  const cleanLocationId = String(locationId || "").trim();
  if (!userId || !cleanLocationId) return null;

  const access = await getLocationOwnerAccess(userId);
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .or(`id.eq.${cleanLocationId},source_id.eq.${cleanLocationId},source_location_id.eq.${cleanLocationId}`)
    .maybeSingle();

  if (!location) return null;
  if (access.isAdmin) return { userId, access, location: location as Record<string, any> };
  if (!hasOwnerAccessToLocation(access, location)) return null;
  return { userId, access, location: location as Record<string, any> };
}
