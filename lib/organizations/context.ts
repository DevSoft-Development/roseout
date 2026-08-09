import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type BusinessOrganizationSummary = {
  id: string;
  name: string;
  organizationType: string;
  role: string;
  locationCount: number;
};

export async function getUserOrganizationContext(
  userId: string,
  requestedOrganizationId?: string | null,
) {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("user_id", userId)
    .eq("status", "active");
  if (membershipError) throw new Error(membershipError.message);

  const organizationIds = Array.from(
    new Set((memberships ?? []).map((row) => String(row.organization_id)).filter(Boolean)),
  );

  if (!organizationIds.length) {
    return {
      organizations: [] as BusinessOrganizationSummary[],
      currentOrganization: null,
      currentOrganizationId: null,
    };
  }

  const [{ data: organizations, error: organizationError }, { data: locationLinks, error: locationError }] =
    await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id,name,organization_type,status")
        .in("id", organizationIds)
        .eq("status", "active"),
      supabaseAdmin
        .from("organization_locations")
        .select("organization_id,location_id,status")
        .in("organization_id", organizationIds)
        .eq("status", "active"),
    ]);

  if (organizationError) throw new Error(organizationError.message);
  if (locationError) throw new Error(locationError.message);

  const roleByOrganization = new Map(
    (memberships ?? []).map((row) => [String(row.organization_id), String(row.role || "member")]),
  );
  const locationCounts = new Map<string, number>();
  for (const link of locationLinks ?? []) {
    const id = String(link.organization_id);
    locationCounts.set(id, (locationCounts.get(id) || 0) + 1);
  }

  const summaries: BusinessOrganizationSummary[] = (organizations ?? [])
    .map((row) => ({
      id: String(row.id),
      name: String(row.name || "Organization"),
      organizationType: String(row.organization_type || "business"),
      role: roleByOrganization.get(String(row.id)) || "member",
      locationCount: locationCounts.get(String(row.id)) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const requested = requestedOrganizationId
    ? summaries.find((organization) => organization.id === requestedOrganizationId)
    : null;
  const currentOrganization = requested || summaries[0] || null;

  return {
    organizations: summaries,
    currentOrganization,
    currentOrganizationId: currentOrganization?.id || null,
  };
}

export async function hasActiveOrganizationMembership(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (error) return false;
  return Boolean(data?.length);
}
