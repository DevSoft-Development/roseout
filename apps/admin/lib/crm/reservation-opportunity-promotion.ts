import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

type Actor = { user_id: string; email: string | null; role: string };

async function audit(actor: Actor, action: string, entityType: string, entityId: string, afterData: unknown) {
  try {
    await getAdminDatabaseClient().from("admin_audit_logs").insert({
      actor_user_id: actor.user_id,
      actor_email: actor.email,
      actor_role: actor.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      after_data: afterData,
    });
  } catch (error) {
    console.error("RESERVE_OPPORTUNITY_AUDIT_FAILED", error);
  }
}

async function createReserveAccount(
  location: { id: string; name: string | null; website: string | null; phone: string | null; reservation_opportunity_score: number | null },
  actor: Actor,
) {
  const db = getAdminDatabaseClient();
  const row = {
    name: String(location.name || "Unnamed restaurant").trim(),
    account_type: "independent_business",
    lifecycle_stage: "prospect",
    owner_user_id: null,
    created_by: actor.user_id,
    updated_by: actor.user_id,
  };
  const { data, error } = await db.from("crm_accounts").insert(row).select("*").single();
  if (error) throw error;

  await db.from("crm_accounts").update({
    website: location.website || null,
    phone: location.phone || null,
    source: "reserve_opportunity",
    source_detail: `Reserve score ${location.reservation_opportunity_score ?? 0}/100`,
    external_reference: location.id,
    next_action: "Review Reserve fit and begin outreach",
    updated_by: actor.user_id,
  }).eq("id", data.id);

  await audit(actor, "crm_account_created", "crm_account", data.id, row);
  return data;
}

async function createReserveOpportunity(
  accountId: string,
  location: {
    id: string;
    name: string | null;
    reservation_opportunity_score: number | null;
    reservation_opportunity_tier: string | null;
    reservation_opportunity_classification: string | null;
  },
  actor: Actor,
) {
  const db = getAdminDatabaseClient();
  const stage = "identified";
  const { data: configured } = await db
    .from("crm_pipeline_stages")
    .select("default_probability,crm_pipelines!inner(pipeline_key)")
    .eq("crm_pipelines.pipeline_key", "reserve_pro")
    .eq("stage_key", stage)
    .maybeSingle();

  const now = new Date().toISOString();
  const row = {
    account_id: accountId,
    name: `TheOutHaven Reserve — ${location.name || "Restaurant"}`,
    pipeline_key: "reserve_pro",
    primary_location_id: location.id,
    stage,
    status: "open",
    forecast_category: "pipeline",
    probability: configured?.default_probability ?? 5,
    created_by: actor.user_id,
    updated_by: actor.user_id,
    last_stage_changed_at: now,
  };
  const { data, error } = await db.from("crm_opportunities").insert(row).select("*").single();
  if (error) throw error;

  await db.from("crm_opportunity_stage_history").insert({
    opportunity_id: data.id,
    to_stage: stage,
    to_forecast_category: "pipeline",
    actor_user_id: actor.user_id,
    metadata: { version: data.version },
  });

  const activity = {
    account_id: data.account_id,
    location_id: data.primary_location_id,
    opportunity_id: data.id,
    actor_user_id: actor.user_id,
    activity_type: "opportunity_created",
    channel: null,
    summary: `Created opportunity: ${data.name}`,
    body: null,
    source_system: "crm_opportunities",
    source_table: "crm_opportunities",
    source_record_id: data.id,
    is_system_generated: true,
  };
  const { error: activityError } = await db
    .from("crm_activities")
    .upsert(activity, {
      onConflict: "source_system,source_table,source_record_id,activity_type",
      ignoreDuplicates: true,
    });
  if (activityError) throw activityError;
  await db.from("crm_accounts").update({ last_activity_at: now }).eq("id", accountId);

  await db.from("crm_opportunities").update({
    product_key: "reserve",
    lead_source: "reserve_opportunity_scoring",
    next_step: "Review evidence and begin outreach",
    metadata: {
      reserve_score: location.reservation_opportunity_score ?? 0,
      reserve_tier: location.reservation_opportunity_tier,
      reserve_classification: location.reservation_opportunity_classification,
    },
  }).eq("id", data.id);

  await audit(actor, "crm_opportunity_created", "crm_opportunity", data.id, data);
  return data;
}

export async function promoteReservationOpportunity(locationId: string, actor: Actor) {
  const db = getAdminDatabaseClient();
  const { data: location, error: locationError } = await db
    .from("locations")
    .select("id,name,website,phone,reservation_upgrade_opportunity,reservation_opportunity_tier,reservation_opportunity_classification,reservation_opportunity_score")
    .eq("id", locationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location) throw new Error("Reserve opportunity not found");

  const eligible =
    location.reservation_upgrade_opportunity === true &&
    location.reservation_opportunity_tier === "high" &&
    location.reservation_opportunity_classification === "no_online_reservations";
  if (!eligible) {
    const error = new Error("Only verified High Reserve opportunities can be added to CRM");
    (error as any).status = 409;
    throw error;
  }

  const { data: existingLink } = await db
    .from("crm_account_locations")
    .select("account_id")
    .eq("location_id", location.id)
    .neq("status", "inactive")
    .limit(1)
    .maybeSingle();

  let accountId = existingLink?.account_id ?? null;
  let accountCreated = false;

  if (!accountId) {
    const { data: existingAccount } = await db
      .from("crm_accounts")
      .select("id")
      .eq("external_reference", location.id)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    accountId = existingAccount?.id ?? null;
  }

  if (!accountId) {
    const account = await createReserveAccount(location, actor);
    accountId = account.id;
    accountCreated = true;
  }

  if (!existingLink) {
    const { error: linkError } = await db.from("crm_account_locations").insert({
      account_id: accountId,
      location_id: location.id,
      relationship_type: "operating_location",
      is_primary_location: true,
      status: "active",
      source: "reserve_opportunity",
      metadata: {
        reserve_score: location.reservation_opportunity_score ?? 0,
        reserve_tier: location.reservation_opportunity_tier,
        reserve_classification: location.reservation_opportunity_classification,
      },
    });
    if (linkError) throw linkError;
  }

  const { data: existingOpportunity } = await db
    .from("crm_opportunities")
    .select("id")
    .eq("primary_location_id", location.id)
    .eq("pipeline_key", "reserve_pro")
    .eq("status", "open")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  let opportunityId = existingOpportunity?.id ?? null;
  let opportunityCreated = false;

  if (!opportunityId) {
    const opportunity = await createReserveOpportunity(accountId, location, actor);
    opportunityId = opportunity.id;
    opportunityCreated = true;
  }

  return { accountId, opportunityId, accountCreated, opportunityCreated };
}
