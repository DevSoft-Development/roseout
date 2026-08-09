import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOrganizationView } from "@/lib/organizations/access";

export async function getUserOrganizations(userId: string) {
  const { data: memberships, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw new Error(error.message);

  const organizationIds = Array.from(
    new Set((memberships || []).map((row) => String(row.organization_id)).filter(Boolean)),
  );
  if (!organizationIds.length) return [];

  const { data: organizations, error: organizationsError } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .in("id", organizationIds)
    .neq("status", "archived")
    .order("name", { ascending: true });
  if (organizationsError) throw new Error(organizationsError.message);

  const membershipByOrg = new Map(
    (memberships || []).map((row) => [String(row.organization_id), row]),
  );

  return (organizations || []).map((organization) => ({
    ...organization,
    membership: membershipByOrg.get(String(organization.id)) || null,
  }));
}

export async function getOrganization(userId: string, organizationId: string) {
  const access = await requireOrganizationView(userId, organizationId);
  if (!access) return null;

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getOrganizationLocations(userId: string, organizationId: string) {
  const access = await requireOrganizationView(userId, organizationId);
  if (!access) return [];

  const { data: links, error } = await supabaseAdmin
    .from("organization_locations")
    .select("id,organization_id,location_id,relationship_type,status,source_type,source_id,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const locationIds = Array.from(
    new Set((links || []).map((row) => String(row.location_id)).filter(Boolean)),
  );
  if (!locationIds.length) return [];

  const { data: locations, error: locationsError } = await supabaseAdmin
    .from("locations")
    .select("id,name,location_type,address,city,state,zip_code,main_image,image_url,status,is_searchable,is_claimed,claim_status,owner_user_id")
    .in("id", locationIds);
  if (locationsError) throw new Error(locationsError.message);

  const locationById = new Map((locations || []).map((row) => [String(row.id), row]));
  return (links || []).map((link) => ({
    ...link,
    location: locationById.get(String(link.location_id)) || null,
  }));
}

export async function getOrganizationMembers(userId: string, organizationId: string) {
  const access = await requireOrganizationView(userId, organizationId);
  if (!access) return [];

  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("id,organization_id,user_id,email,display_name,role,status,invited_by_user_id,invited_at,accepted_at,created_at,updated_at")
    .eq("organization_id", organizationId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
