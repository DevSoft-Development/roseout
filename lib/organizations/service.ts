import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOrganizationManage } from "@/lib/organizations/access";
import type {
  OrganizationMemberRole,
  OrganizationType,
} from "@/lib/organizations/types";

const FOUNDATION_MIGRATION_VERSION = "organization-foundation-v1";

async function writeOrganizationAudit(input: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId || null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    old_value: input.oldValue || null,
    new_value: input.newValue || null,
    metadata: input.metadata || {},
  });
  if (error) throw new Error(error.message);
}

export async function createOrganization(input: {
  userId: string;
  name: string;
  legalName?: string | null;
  organizationType?: OrganizationType;
  metadata?: Record<string, unknown>;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Organization name is required.");

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .insert({
      name,
      legal_name: input.legalName?.trim() || null,
      organization_type: input.organizationType || "business",
      created_by_user_id: input.userId,
      metadata: input.metadata || {},
    })
    .select("*")
    .single();
  if (organizationError || !organization) {
    throw new Error(organizationError?.message || "Unable to create organization.");
  }

  const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
    organization_id: organization.id,
    user_id: input.userId,
    role: "owner",
    status: "active",
    accepted_at: new Date().toISOString(),
  });

  if (memberError) {
    await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
    throw new Error(memberError.message);
  }

  try {
    await writeOrganizationAudit({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      newValue: {
        name: organization.name,
        organization_type: organization.organization_type,
      },
    });
  } catch (error) {
    await supabaseAdmin.from("organization_members").delete().eq("organization_id", organization.id);
    await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
    throw error;
  }

  return organization;
}

export async function addOrganizationMember(input: {
  actorUserId: string;
  organizationId: string;
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
  role?: OrganizationMemberRole;
}) {
  const access = await requireOrganizationManage(input.actorUserId, input.organizationId);
  if (!access) throw new Error("Organization management access required.");
  if (!input.userId && !input.email?.trim()) throw new Error("Member user or email is required.");

  const status = input.userId ? "active" : "invited";
  const now = new Date().toISOString();
  const payload = {
    organization_id: input.organizationId,
    user_id: input.userId || null,
    email: input.email?.trim().toLowerCase() || null,
    display_name: input.displayName?.trim() || null,
    role: input.role || "member",
    status,
    invited_by_user_id: input.actorUserId,
    invited_at: now,
    accepted_at: input.userId ? now : null,
  };

  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Unable to add organization member.");

  await writeOrganizationAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: status === "active" ? "organization.member_added" : "organization.member_invited",
    entityType: "organization_member",
    entityId: data.id,
    newValue: { user_id: data.user_id, email: data.email, role: data.role, status: data.status },
  });

  return data;
}

export async function updateOrganizationMemberRole(input: {
  actorUserId: string;
  organizationId: string;
  memberId: string;
  role: OrganizationMemberRole;
}) {
  const access = await requireOrganizationManage(input.actorUserId, input.organizationId);
  if (!access) throw new Error("Organization management access required.");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("organization_members")
    .select("id,user_id,role,status")
    .eq("id", input.memberId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (existingError || !existing) throw new Error(existingError?.message || "Organization member not found.");

  if (existing.role === "owner" && input.role !== "owner") {
    const { count } = await supabaseAdmin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .eq("role", "owner");
    if ((count || 0) <= 1) throw new Error("An organization must keep at least one active owner.");
  }

  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq("id", input.memberId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Unable to update organization member.");

  await writeOrganizationAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "organization.member_role_changed",
    entityType: "organization_member",
    entityId: input.memberId,
    oldValue: { role: existing.role },
    newValue: { role: input.role },
  });
  return data;
}

export async function linkLocationToOrganization(input: {
  actorUserId: string;
  organizationId: string;
  locationId: string;
  relationshipType?: "owned" | "operated" | "managed" | "venue" | "partner";
  sourceType?: string | null;
  sourceId?: string | null;
  migrationStrategy?: string | null;
  migrationConfidence?: "high" | "medium" | "review";
  metadata?: Record<string, unknown>;
}) {
  const access = await requireOrganizationManage(input.actorUserId, input.organizationId);
  if (!access) throw new Error("Organization management access required.");

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,source_table,source_id")
    .eq("id", input.locationId)
    .maybeSingle();
  if (locationError || !location) throw new Error(locationError?.message || "Location not found.");

  const { data, error } = await supabaseAdmin
    .from("organization_locations")
    .upsert(
      {
        organization_id: input.organizationId,
        location_id: input.locationId,
        relationship_type: input.relationshipType || "owned",
        status: "active",
        linked_by_user_id: input.actorUserId,
        source_type: input.sourceType || null,
        source_id: input.sourceId || null,
        metadata: input.metadata || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,location_id" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Unable to link organization location.");

  if (input.sourceType && input.sourceId && input.migrationStrategy) {
    const { error: migrationError } = await supabaseAdmin.from("organization_migration_links").upsert(
      {
        organization_id: input.organizationId,
        source_table: input.sourceType,
        source_record_id: input.sourceId,
        target_entity_type: "organization_location",
        target_entity_id: data.id,
        strategy: input.migrationStrategy,
        confidence: input.migrationConfidence || "high",
        migration_version: FOUNDATION_MIGRATION_VERSION,
        metadata: input.metadata || {},
      },
      {
        onConflict: "source_table,source_record_id,target_entity_type,target_entity_id,migration_version",
      },
    );
    if (migrationError) throw new Error(migrationError.message);
  }

  await writeOrganizationAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "organization.location_linked",
    entityType: "organization_location",
    entityId: data.id,
    newValue: {
      location_id: input.locationId,
      relationship_type: data.relationship_type,
      source_type: input.sourceType || null,
      source_id: input.sourceId || null,
    },
  });

  return data;
}

export async function recordOrganizationMigrationEvidence(input: {
  organizationId: string;
  sourceTable: string;
  sourceRecordId: string;
  targetEntityType: string;
  targetEntityId: string;
  strategy: string;
  confidence?: "high" | "medium" | "review";
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from("organization_migration_links")
    .upsert(
      {
        organization_id: input.organizationId,
        source_table: input.sourceTable,
        source_record_id: input.sourceRecordId,
        target_entity_type: input.targetEntityType,
        target_entity_id: input.targetEntityId,
        strategy: input.strategy,
        confidence: input.confidence || "high",
        migration_version: FOUNDATION_MIGRATION_VERSION,
        metadata: input.metadata || {},
      },
      {
        onConflict: "source_table,source_record_id,target_entity_type,target_entity_id,migration_version",
      },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Unable to record organization migration evidence.");
  return data;
}
