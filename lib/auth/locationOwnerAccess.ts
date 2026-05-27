import { createClient } from "@/lib/supabase-server";

const ADMIN_ROLES = new Set(["superuser", "admin", "editor", "reviewer", "viewer"]);

export type OwnerAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  ownedLocationIds: string[];
  ownedSourceLocationIds: string[];
};

function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

export async function getLocationOwnerAccess(userId: string): Promise<OwnerAccess> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = normalizeRole(profile?.role);
  const isAdmin = ADMIN_ROLES.has(role);
  const isSuperadmin = role === "superuser";

  const ownedLocationIds = new Set<string>();
  const ownedSourceLocationIds = new Set<string>();

  const [{ data: claims }, { data: mappings }, { data: directOwned }] = await Promise.all([
    supabase
      .from("business_claims")
      .select("location_id,source_location_id")
      .eq("user_id", userId)
      .eq("status", "approved"),
    supabase
      .from("location_owner_locations")
      .select("location_id,source_location_id")
      .eq("user_id", userId)
      .eq("status", "active"),
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
