import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const migration = read("supabase/migrations/20261005133000_operational_shard_routing.sql").toLowerCase();
const resolver = read("lib/operational-shards.ts");
const payment = read("lib/pos/payments/check-payment-service.ts");
const catalog = read("lib/admin/credential-vault-catalog.ts");
const adminCatalog = read("apps/admin/lib/admin/credential-vault-catalog.ts");
const runtimeSource = read("lib/admin/credential-vault-runtime-source.ts");
const hardening = read("infra/supabase/operational-shards/hardening-v2.sql").toLowerCase();
const writeFence = read("infra/supabase/operational-shards/write-fence-v3.sql").toLowerCase();
const rebalance = read("scripts/operational-shard-rebalance.mjs");
const initialPlacement = read("scripts/operational-shard-initial-placement.mjs");
const primaryPlacementFence = read("supabase/migrations/20261006031500_primary_operational_placement_fence.sql").toLowerCase();
const failover = read(".github/workflows/operational-shard-failover.yml");
const rebalanceWorkflow = read(".github/workflows/operational-shard-rebalance.yml");
const initialPlacementWorkflow = read(".github/workflows/operational-shard-initial-placement.yml");
const replicationWorkflow = read(".github/workflows/operational-shard-dr-replication.yml");
const validationWorkflow = read(".github/workflows/operational-shard-validation.yml");
const validationScript = read("scripts/validate-operational-shards.mjs");
const liveBootstrap = read(".github/workflows/operational-shard-live-bootstrap.yml");
const isolationProof = read("scripts/operational-shard-isolation-proof.mjs");
const isolationProofWorkflow = read(".github/workflows/operational-shard-isolation-proof.yml");

for (const token of [
  "create table if not exists public.operational_shards",
  "operational_shard_id text not null default 'primary'",
  "create table if not exists public.location_shard_moves",
  "soft_location_target integer not null default 300",
  "hard_location_limit integer not null default 500",
  "enable row level security",
  "revoke all on table public.operational_shards from anon, authenticated",
]) {
  if (!migration.includes(token)) throw new Error(`Missing operational shard schema invariant: ${token}`);
}

for (const token of [
  "operational_schema_versions",
  "pos_check_resources_layout_item_fk_idx",
  "pos_check_resources_seating_resource_fk_idx",
  "pos_checks_server_staff_profile_fk_idx",
  "pos_orders_server_staff_profile_fk_idx",
  "pos_tenders_staff_profile_fk_idx",
  "reservation_seating_resources_parent_layout_item_fk_idx",
  "reservation_resource_assignments",
  "reservation_resource_assignments_location_idx",
  "provider_call_lease_expires_at",
  "pos_expire_stale_card_tenders",
  "pos_provider_call_lease_v6",
  "toh_operational_dr",
]) {
  if (!hardening.includes(token)) throw new Error(`Missing shard hardening invariant: ${token}`);
}


for (const token of [
  "primary_location_write_fences",
  "enforce_primary_location_write_fence",
  "for share",
  "primary_location_writes_frozen",
  "pos_tenders",
  "location_reservations",
  "reservation_resource_assignments",
]) {
  if (!primaryPlacementFence.includes(token)) throw new Error(`Missing primary placement fence invariant: ${token}`);
}

for (const token of [
  "TARGET_SCHEMA_VERSION = 6",
  "location_not_on_primary",
  "setPrimaryFence",
  "drainPrimaryCardTenders",
  "source_row_not_shard_compatible",
  "targetSnapshot: \"replaced\"",
  "sourceRetention: \"fenced\"",
  "routing_changed_during_initial_placement",
  "global_primary_freeze_compare_and_swap_failed",
  "global_initial_placement_cutover_compare_and_swap_failed",
  "classifyAuthoritativeCutoverState",
  "targetBypassToken",
  "targetFenceInstalled",
  "targetFenceReleased",
  "placed-to-",
  "reservation_resource_assignments",
]) {
  if (!initialPlacement.includes(token)) throw new Error(`Missing safe initial placement invariant: ${token}`);
}
if (!initialPlacement.includes('String(key).startsWith("sb_secret_")')) {
  throw new Error("Initial placement must support modern Supabase secret API key authentication.");
}
if (!rebalance.includes('String(key).startsWith("sb_secret_")')) {
  throw new Error("Shard rebalance must support modern Supabase secret API key authentication.");
}
if (!validationScript.includes('String(key).startsWith("sb_secret_")')) {
  throw new Error("Shard validation must support modern Supabase secret API key authentication.");
}
if (!isolationProof.includes('String(key).startsWith("sb_secret_")')) {
  throw new Error("Shard isolation proof must support modern Supabase secret API key authentication.");
}
for (const token of [
  "operational-shard-control-production",
  "operational-shard-initial-placement.mjs",
  ".secretKey // .serviceRoleKey // empty",
]) {
  if (!initialPlacementWorkflow.includes(token)) throw new Error(`Initial placement workflow invariant missing: ${token}`);
}

for (const token of [
  "operational_shard_write_gate",
  "operational_location_write_fences",
  "for share",
  "operational_shard_writes_frozen",
  "operational_location_writes_frozen",
  "bypass_token_hash",
  "bypass_expires_at",
  "x-theouthaven-rebalance-token",
  "extensions.digest",
  "reservation_resource_assignments",
  "new-shard-standby",
  "operational_write_fence_standby_v5",
]) {
  if (!writeFence.includes(token)) throw new Error(`Missing local write-fence invariant: ${token}`);
}

for (const token of [
  "PAGE_SIZE = 500",
  "MAX_UPSERT_ROWS = 100",
  "MAX_UPSERT_BYTES = 512 * 1024",
  "writableBatches",
  "Buffer.byteLength",
  "row_too_large_for_rebalance",
  "fetchAll",
  "line_total_cents",
  "total_cents",
  "in_flight_card_tenders_did_not_drain",
  "persistedTenderIds",
  "provider_call_lease_expires_at",
  "pos_expire_stale_card_tenders",
  "pos_payments",
  "sourceFenceFrozen",
  "deletionOrder",
  "routing_changed_during_rebalance",
  "sourceRoutingEpoch",
  "targetRoutingEpoch",
  "targetSnapshot: \"replaced\"",
  "global_freeze_compare_and_swap_failed",
  "global_cutover_compare_and_swap_failed",
  "cutoverDone",
  "post_cutover_audit_retry",
  "targetBypassToken",
  "targetFenceInstalled",
  "targetFenceReleased",
  "target_fence_release_failed",
  "reservation_resource_assignments",
  "classifyAuthoritativeCutoverState",
  "ambiguous_cutover_state",
  "authoritativeCutoverState === \"cutover\"",
]) {
  if (!rebalance.includes(token)) throw new Error(`Missing safe rebalance invariant: ${token}`);
}

for (const token of [
  "operational_shard_write_gate",
  "pg_wal_lsn_diff",
  "caught_up",
  "LAG_BYTES",
  "write_enabled=false",
  "SUB_DISABLED",
  "alter subscription $SUB enable",
  "replication_state='initializing'",
  "replication_state='broken'",
  "failover_state='degraded'",
  "RECOVERY_OK",
  "PRIMARY_OPENED",
  "failback-aborted",
  "mark-failback-degraded",
  "with moved as",
  "rollback-routing.json",
  "ambiguous-routing",
  "CURRENT_ACTIVE",
  "CURRENT_EPOCH",
  "OPERATIONAL_SHARDS_JSON",
  "runtime_preflight",
  "operational_shard_write_gate",
  "freeze_runtime_gate",
  "DR_RECOVERY_FROZEN",
  "refreeze-dr.json",
  "alter subscription $SUB enable",
  "from public.pos_payments p where p.tender_id=t.id",
  "Mark the attempted mutation before the request",
  "CONFIRM_FAILBACK",
  "FAILBACK_SUB",
  "truncate table",
  "create subscription $FAILBACK_SUB",
  "failback_ready",
  "row_hash",
  "alter subscription $SUB enable",
  "replication_state='healthy'",
  "pos_expire_stale_card_tenders",
]) {
  if (!failover.includes(token)) throw new Error(`Missing failover RPO invariant: ${token}`);
}

if (!isolationProof.includes('location_type: "restaurant"')) {
  throw new Error("Isolation proof must provide an explicit valid location_type.");
}
if (!isolationProof.includes("operational_location_write_fences")) {
  throw new Error("Isolation proof must clean synthetic location write-fence rows.");
}
for (const token of [
  "GLOBAL_SUPABASE_URL",
  "GLOBAL_SUPABASE_SERVICE_ROLE_KEY",
  "active_physical_shard_id",
  'activeShard("shard-01", "shard-01-dr")',
  'activeShard("shard-02", "shard-02-dr")',
]) {
  if (!isolationProof.includes(token)) throw new Error(`Isolation proof must use authoritative active routing: ${token}`);
}
for (const token of [
  "GLOBAL_SUPABASE_URL",
  "GLOBAL_SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!isolationProofWorkflow.includes(token)) throw new Error(`Isolation proof workflow invariant missing: ${token}`);
}

for (const workflow of [failover, rebalanceWorkflow, initialPlacementWorkflow, replicationWorkflow, liveBootstrap, isolationProofWorkflow]) {
  if (!workflow.includes("operational-shard-control-production")) {
    throw new Error("Operational shard mutations must share one serialized production control-plane concurrency group.");
  }
}
for (const workflow of [replicationWorkflow, liveBootstrap, isolationProofWorkflow]) {
  if (!workflow.includes("operational-shard-contract-") || !workflow.includes("github.event_name == 'pull_request'")) {
    throw new Error("PR-only shard contract checks must use workflow-scoped concurrency instead of the production mutation queue.");
  }
}

for (const shardId of ["shard-01", "shard-01-dr", "shard-02", "shard-02-dr"]) {
  if (!validationWorkflow.includes(shardId)) {
    throw new Error(`Standard live validation must include ${shardId}.`);
  }
}
if (!validationScript.includes("Shard runtime write disabled")) {
  throw new Error("Live validation must fail when a physical runtime shard is not write-capable.");
}
for (const token of [
  '"shard-01-dr": {url:$s1dr,serviceRoleKey:$s1drk,readEnabled:true,writeEnabled:true}',
  '"shard-02-dr": {url:$s2dr,serviceRoleKey:$s2drk,readEnabled:true,writeEnabled:true}',
]) {
  if (!liveBootstrap.includes(token)) throw new Error(`DR runtime configuration must be failover-capable: ${token}`);
}
if (!replicationWorkflow.includes("replication_state='broken'") || !replicationWorkflow.includes("replication_state='healthy'")) {
  throw new Error("Replication rotation must fail closed and only mark healthy after verification.");
}
for (const token of [
  "active_physical_shard_id",
  "standby-dr-replication",
  "reservation_resource_assignments",
  "hardening-v2.sql",
]) {
  if (!replicationWorkflow.includes(token)) throw new Error(`Missing replication standby safety invariant: ${token}`);
}
for (const token of [
  "hardening-v2.sql",
  "standby-dr",
  "standby-primary",
  "schema_version=6",
  "reservation_resource_assignments",
  "restore_authoritative_gates",
  "apply_and_align",
  "ACTIVATE_INITIAL_PROVISIONING",
  "inputs.activate_initial_provisioning",
  "status in ('planned','provisioning')",
  "replication_state in ('initializing','healthy')",
]) {
  if (!liveBootstrap.includes(token)) throw new Error(`Missing bootstrap standby/schema invariant: ${token}`);
}
if (liveBootstrap.indexOf("routing-gates.json") > liveBootstrap.indexOf('apply_and_align "$SHARD01_REF"')) {
  throw new Error("Bootstrap must resolve authoritative routing before applying fail-closed shard gates.");
}
if (liveBootstrap.includes("set status='active', read_enabled=true, write_enabled=true, schema_version=6")) {
  throw new Error("Bootstrap must not unconditionally reopen fail-closed shard registry writes.");
}
if (!liveBootstrap.includes('if [ "$ACTIVATE_INITIAL_PROVISIONING" = true ]')) {
  throw new Error("Shard write activation must require explicit initial-provisioning intent.");
}
if (!rebalance.includes("for (const batch of writableBatches(table, sourceRows))")) {
  throw new Error("Rebalance target writes must use bounded batches.");
}
if (rebalance.indexOf("sourceFenceFrozen = true;") > rebalance.indexOf("await upsertFence(source")) {
  throw new Error("Rebalance must record the source fence attempt before the network mutation.");
}
if (rebalance.indexOf("globalFrozen = true;") > rebalance.indexOf("const frozenRows = await patchGlobal")) {
  throw new Error("Rebalance must record the global freeze attempt before the network mutation.");
}
if (rebalance.indexOf("targetFenceInstalled = true;") > rebalance.indexOf("await upsertFence(target")) {
  throw new Error("Rebalance must record the target fence attempt before the network mutation.");
}
for (const [flag, mutation] of [
  ["PHYSICAL_FROZEN=true", "set frozen=true,reason='failover-promote-dr'"],
  ["SUB_DISABLED=true", "alter subscription $SUB disable"],
  ["PRIMARY_OPENED=true", "set frozen=false,reason='active-primary'"],
]) {
  if (failover.indexOf(flag) > failover.indexOf(mutation)) {
    throw new Error(`Failover response-loss bookkeeping must precede mutation: ${flag}`);
  }
}
if ((failover.match(/from public\.pos_payments p where p\.tender_id=t\.id/g) || []).length < 2) {
  throw new Error("Failover and failback drains must exclude persisted card tenders.");
}
if ((failover.match(/pos_expire_stale_card_tenders\(null\)/g) || []).length < 2) {
  throw new Error("Failover and failback must expire abandoned card-provider leases before drain checks.");
}
if (failover.indexOf("set frozen=true,reason='failback-primary'") > failover.indexOf("create subscription $FAILBACK_SUB")) {
  throw new Error("Failback must freeze DR before the final DR-to-primary resync.");
}
if (failover.indexOf("create subscription $FAILBACK_SUB") > failover.indexOf("set frozen=false,reason='active-primary'")) {
  throw new Error("Failback must complete final resync before opening primary.");
}
if (!hardening.includes("now() + interval '2 minutes'")) {
  throw new Error("Card tender reservation must create an explicit bounded provider-call lease.");
}

if (!validationScript.includes("reservation_resource_assignments")) {
  throw new Error("Standard shard validation must probe reservation assignment schema.");
}

for (const forbiddenColumn of ["service_role_key", "password", "api_key", "credential_value", "secret_key"]) {
  const columnPattern = new RegExp(`\\b${forbiddenColumn}\\b\\s+(text|varchar|jsonb|bytea)`, "i");
  if (columnPattern.test(migration)) {
    throw new Error(`Operational shard database metadata must never store shard credential column: ${forbiddenColumn}`);
  }
}

for (const token of [
  "OPERATIONAL_SHARDS_JSON",
  "operational_shard_unconfigured",
  "operational_shard_write_disabled",
  "operational_shard_write_requires_authoritative_resolution",
  "operational_shard_assignment_epoch_mismatch",
  "operational_shard_routing_epoch_mismatch",
  "operational_shard_writes_frozen",
  "active_physical_shard_id",
  "routing_epoch",
  "getSupabaseAdminClient()",
  "getOperationalShardClientInternal",
  "authoritativeRegistryWrite",
  'mode === "write"',
]) {
  if (!resolver.includes(token)) throw new Error(`Missing shard resolver invariant: ${token}`);
}

if (!resolver.includes("getOperationalShardClientInternal(physicalShardId, mode, mode === \"write\")")) {
  throw new Error("Authoritative shard resolution must not be blocked by a stale runtime write hint.");
}
if (!resolver.includes("config.writeEnabled === false && !authoritativeRegistryWrite")) {
  throw new Error("Direct shard clients must continue honoring runtime write-disable hints.");
}

if (!payment.includes("resolveOperationalShardForLocationId")) {
  throw new Error("POS payment persistence must resolve authoritative operational routing before writes.");
}
if (payment.includes("getOperationalShardClientForLocation")) {
  throw new Error("POS payment persistence must not route writes from a stale location object.");
}
if (payment.includes('supabaseAdmin.rpc("pos_begin_card_tender"')) {
  throw new Error("POS payment service must not use the global Supabase client for tenant transaction writes.");
}
for (const field of [
  "shard01Url",
  "shard01SecretKey",
  "shard01DrUrl",
  "shard01DrSecretKey",
  "shard02Url",
  "shard02SecretKey",
  "shard02DrUrl",
  "shard02DrSecretKey",
]) {
  if (!catalog.includes(field) || !adminCatalog.includes(field)) {
    throw new Error(`Operational shard credential field must be managed through both credential vault catalogs: ${field}`);
  }
}
if (catalog.includes('{ key: "operationalShardsJson"') || adminCatalog.includes('{ key: "operationalShardsJson"')) {
  throw new Error("Operational shard compatibility JSON must remain generated and non-editable.");
}
if (!runtimeSource.includes("OPERATIONAL_SHARDS_JSON") || !liveBootstrap.includes(".operationalShardsJson=$shards")) {
  throw new Error("Operational shard runtime compatibility JSON must be generated through the centralized credential vault.");
}

console.log("Operational shard routing regression passed.");
