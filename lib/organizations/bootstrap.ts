import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createOrganization,
  linkLocationToOrganization,
  recordOrganizationMigrationEvidence,
} from "@/lib/organizations/service";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function ensureOrganizationForLocationOwner(input: {
  userId: string;
  locationId: string;
  organizationName?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
}) {
  const userId = clean(input.userId);
  const locationId = clean(input.locationId);
  if (!userId || !locationId) {
    throw new Error("Organization bootstrap requires a user and location.");
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,location_name,restaurant_name,activity_name,source_table,source_id")
    .eq("id", locationId)
    .maybeSingle();
  if (locationError || !location) {
    throw new Error(locationError?.message || "Location not found for organization bootstrap.");
  }

  const { data: existingLinks, error: linkLookupError } = await supabaseAdmin
    .from("organization_locations")
    .select("organization_id")
    .eq("location_id", locationId)
    .eq("status", "active")
    .limit(20);
  if (linkLookupError) throw new Error(linkLookupError.message);

  const organizationIds = Array.from(
    new Set((existingLinks ?? []).map((row) => String(row.organization_id)).filter(Boolean)),
  );

  if (organizationIds.length) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("organization_id", organizationIds)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (membership?.organization_id) {
      return {
        organizationId: String(membership.organization_id),
        created: false as const,
        linked: true as const,
      };
    }

    // Do not silently grant ownership into an already-linked organization.
    // A future verification flow must resolve that relationship explicitly.
    throw new Error(
      "This location is already linked to an organization. Organization verification is required before adding another owner.",
    );
  }

  const displayName =
    clean(input.organizationName) ||
    clean(location.name) ||
    clean(location.location_name) ||
    clean(location.restaurant_name) ||
    clean(location.activity_name) ||
    "TheOutHaven Organization";

  const organization = await createOrganization({
    userId,
    name: displayName,
    organizationType: "business",
    metadata: {
      bootstrap_source: input.sourceType || "location_owner",
      bootstrap_location_id: locationId,
    },
  });

  try {
    const link = await linkLocationToOrganization({
      actorUserId: userId,
      organizationId: organization.id,
      locationId,
      relationshipType: "owned",
      sourceType: input.sourceType || "location_owner_locations",
      sourceId: input.sourceId || locationId,
      migrationStrategy: "owner_claim_bootstrap",
      migrationConfidence: "high",
      metadata: {
        bootstrap_actor_user_id: input.actorUserId || userId,
        source_table: location.source_table || null,
        source_location_id: location.source_id || null,
      },
    });

    await recordOrganizationMigrationEvidence({
      organizationId: organization.id,
      sourceTable: input.sourceType || "location_owner_locations",
      sourceRecordId: input.sourceId || locationId,
      targetEntityType: "organization",
      targetEntityId: organization.id,
      strategy: "owner_claim_bootstrap",
      confidence: "high",
      metadata: {
        location_id: locationId,
        organization_location_id: link.id,
      },
    });

    return {
      organizationId: String(organization.id),
      created: true as const,
      linked: true as const,
    };
  } catch (error) {
    // Creation is only considered complete when the location relationship exists.
    // Cleanup is safe because the organization was created in this invocation.
    await supabaseAdmin.from("organization_members").delete().eq("organization_id", organization.id);
    await supabaseAdmin.from("organization_audit_logs").delete().eq("organization_id", organization.id);
    await supabaseAdmin.from("organization_migration_links").delete().eq("organization_id", organization.id);
    await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
    throw error;
  }
}
