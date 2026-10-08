import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const globalUrl = String(process.env.GLOBAL_SUPABASE_URL || "").replace(/\/$/, "");
const globalKey = String(process.env.GLOBAL_SUPABASE_SERVICE_ROLE_KEY || "");
const locationId = String(process.env.LOCATION_ID || "");
const targetLogicalShard = String(process.env.TARGET_SHARD_ID || "");
const expectedEpoch = Number(process.env.EXPECTED_ASSIGNMENT_EPOCH || "");
const operationalShardsFile = String(process.env.OPERATIONAL_SHARDS_FILE || "");
const config = JSON.parse(
  operationalShardsFile
    ? readFileSync(operationalShardsFile, "utf8")
    : String(process.env.OPERATIONAL_SHARDS_JSON || "{}"),
);

const PAGE_SIZE = 500;
const MAX_UPSERT_ROWS = 100;
const MAX_UPSERT_BYTES = 512 * 1024;
const TARGET_SCHEMA_VERSION = 10;

if (!globalUrl || !globalKey || !locationId || !targetLogicalShard || !Number.isInteger(expectedEpoch) || expectedEpoch < 1) {
  throw new Error("invalid_initial_placement_configuration");
}
if (!["shard-01", "shard-02"].includes(targetLogicalShard)) {
  throw new Error("invalid_initial_placement_target");
}

const authHeaders = (key) => ({
  apikey: key,
  ...(String(key).startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
});

const headers = (key, extra = {}) => ({
  ...authHeaders(key),
  "Content-Type": "application/json",
  ...extra,
});

async function request(url, key, path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: headers(key, init.headers || {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`http_${response.status}:${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAll(url, key, table, filterQuery, columns) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request(
      url,
      key,
      `/rest/v1/${table}?${filterQuery}&select=${columns.join(",")}&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function globalRows(table, query) {
  return request(globalUrl, globalKey, `/rest/v1/${table}?${query}`);
}

async function patchGlobal(table, filter, body, prefer = "return=minimal") {
  return request(globalUrl, globalKey, `/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: prefer },
    body: JSON.stringify(body),
  });
}

async function insertGlobal(table, body) {
  return request(globalUrl, globalKey, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function setPrimaryFence(epoch, frozen, reason) {
  return request(globalUrl, globalKey, "/rest/v1/primary_location_write_fences?on_conflict=location_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      location_id: locationId,
      assignment_epoch: epoch,
      frozen,
      reason,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function setTargetFence(shard, epoch, frozen, reason, bypassToken = "") {
  const base = String(shard.url).replace(/\/$/, "");
  return request(base, shard.serviceRoleKey, "/rest/v1/operational_location_write_fences?on_conflict=location_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      location_id: locationId,
      assignment_epoch: epoch,
      frozen,
      reason,
      bypass_token_hash: bypassToken ? createHash("sha256").update(bypassToken).digest("hex") : null,
      bypass_expires_at: bypassToken ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }),
  });
}

const tableSpecs = [
  {
    table: "locations",
    filterColumn: "id",
    columns: ["id", "location_type", "operational_shard_id", "created_at", "updated_at"],
    required: ["id", "location_type", "operational_shard_id", "created_at", "updated_at"],
    transform: (row) => ({ ...row, operational_shard_id: targetLogicalShard }),
  },
  {
    table: "reserve_staff_profiles",
    filterColumn: "location_id",
    columns: ["id", "location_id", "display_name", "role", "pin_hash", "pin_length", "is_active", "can_quick_switch", "failed_pin_attempts", "pin_locked_until", "created_at", "updated_at"],
    required: ["id", "location_id", "display_name", "role", "pin_length", "is_active", "can_quick_switch", "failed_pin_attempts", "created_at", "updated_at"],
  },
  {
    table: "layout_items",
    filterColumn: "location_id",
    columns: ["id", "location_id", "item_type", "item_name", "item_number", "capacity", "status", "is_active", "sort_order", "notes", "created_at", "updated_at"],
    required: ["id", "location_id", "item_type", "item_name", "capacity", "status", "is_active", "sort_order", "created_at", "updated_at"],
  },
  {
    table: "reservation_seating_resources",
    filterColumn: "location_id",
    columns: ["id", "location_id", "parent_layout_item_id", "resource_type", "label", "seat_index", "capacity", "is_active", "created_at", "updated_at"],
    required: ["id", "location_id", "parent_layout_item_id", "resource_type", "label", "seat_index", "capacity", "is_active", "created_at", "updated_at"],
  },
  {
    table: "location_reservations",
    filterColumn: "location_id",
    columns: ["id", "location_id", "customer_name", "customer_email", "customer_phone", "reservation_date", "reservation_time", "party_size", "status", "created_at", "updated_at"],
    required: ["id", "location_id", "customer_name", "reservation_date", "reservation_time", "party_size", "status", "created_at", "updated_at"],
  },
  {
    table: "reservation_resource_assignments",
    filterColumn: "location_id",
    columns: ["id", "reservation_id", "location_id", "seating_resource_id", "assigned_at"],
    required: ["id", "reservation_id", "location_id", "seating_resource_id", "assigned_at"],
  },
  {
    table: "pos_checks",
    filterColumn: "location_id",
    columns: ["id", "location_id", "reservation_id", "server_staff_profile_id", "status", "guest_count", "currency", "subtotal_cents", "discount_cents", "tax_cents", "service_charge_cents", "total_cents", "amount_paid_cents", "amount_refunded_cents", "tip_cents", "opened_at", "closed_at", "voided_at", "notes", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "status", "guest_count", "currency", "subtotal_cents", "discount_cents", "tax_cents", "service_charge_cents", "total_cents", "amount_paid_cents", "amount_refunded_cents", "tip_cents", "opened_at", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_check_resources",
    filterColumn: "location_id",
    columns: ["id", "check_id", "location_id", "layout_item_id", "seating_resource_id", "resource_label", "created_at"],
    required: ["id", "check_id", "location_id", "created_at"],
  },
  {
    table: "pos_orders",
    filterColumn: "location_id",
    columns: ["id", "location_id", "check_id", "server_staff_profile_id", "status", "course_name", "notes", "sent_at", "fired_at", "fulfilled_at", "voided_at", "void_reason", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "check_id", "status", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_order_items",
    filterColumn: "location_id",
    columns: ["id", "location_id", "order_id", "check_id", "catalog_item_id", "item_name", "seat_number", "quantity", "unit_price_cents", "unit_modifier_total_cents", "discount_cents", "modifiers", "notes", "status", "void_reason", "created_at", "updated_at"],
    required: ["id", "location_id", "order_id", "check_id", "item_name", "quantity", "unit_price_cents", "unit_modifier_total_cents", "discount_cents", "modifiers", "status", "created_at", "updated_at"],
  },
  {
    table: "pos_tenders",
    filterColumn: "location_id",
    columns: ["id", "location_id", "check_id", "staff_profile_id", "tender_number", "tender_type", "status", "amount_cents", "tip_cents", "amount_refunded_cents", "cash_received_cents", "cash_change_cents", "completed_at", "voided_at", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "check_id", "tender_number", "tender_type", "status", "amount_cents", "tip_cents", "amount_refunded_cents", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_payments",
    filterColumn: "location_id",
    columns: ["id", "location_id", "check_id", "tender_id", "provider", "provider_payment_intent_id", "connected_account_id", "idempotency_key", "status", "amount_cents", "tip_cents", "application_fee_cents", "payment_method_type", "failure_code", "failure_message", "processed_at", "succeeded_at", "canceled_at", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "check_id", "tender_id", "provider", "provider_payment_intent_id", "idempotency_key", "status", "amount_cents", "tip_cents", "application_fee_cents", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_inventory_items",
    filterColumn: "location_id",
    columns: ["id", "location_id", "catalog_item_id", "tracking_mode", "quantity_on_hand", "low_stock_threshold", "manual_sold_out", "sold_out_reason", "sold_out_until", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "catalog_item_id", "tracking_mode", "manual_sold_out", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_inventory_transactions",
    filterColumn: "location_id",
    columns: ["id", "location_id", "idempotency_key", "source_type", "source_id", "status", "created_at", "metadata"],
    required: ["id", "location_id", "idempotency_key", "source_type", "status", "created_at", "metadata"],
  },
  {
    table: "pos_inventory_adjustments",
    filterColumn: "location_id",
    columns: ["id", "location_id", "inventory_transaction_id", "inventory_item_id", "catalog_item_id", "quantity_delta", "reason", "source_type", "source_id", "created_at", "metadata"],
    required: ["id", "location_id", "inventory_item_id", "catalog_item_id", "quantity_delta", "reason", "source_type", "created_at", "metadata"],
  },
  {
    table: "pos_ordering_settings",
    filterColumn: "location_id",
    columns: ["id", "location_id", "accepting_orders", "auto_accept", "auto_print", "default_prep_minutes", "prep_delay_minutes", "paused_until", "timezone", "slot_minutes", "max_orders_per_slot", "cutoff_minutes_before_close", "max_advance_days", "tax_rate_bps", "service_charge_bps", "ordering_hours", "pickup_instructions", "notification_settings", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "accepting_orders", "auto_accept", "auto_print", "default_prep_minutes", "prep_delay_minutes", "timezone", "slot_minutes", "tax_rate_bps", "service_charge_bps", "ordering_hours", "notification_settings", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_online_orders",
    filterColumn: "location_id",
    columns: ["id", "location_id", "check_id", "order_id", "tender_id", "source", "status", "customer_name", "customer_email", "customer_phone", "requested_pickup_at", "promised_pickup_at", "subtotal_cents", "tax_cents", "service_charge_cents", "tip_cents", "total_cents", "currency", "payment_provider", "provider_payment_intent_id", "inventory_idempotency_key", "idempotency_key", "accepted_at", "preparing_at", "ready_at", "completed_at", "canceled_at", "cancel_reason", "metadata", "created_at", "updated_at"],
    required: ["id", "location_id", "check_id", "order_id", "tender_id", "source", "status", "customer_name", "subtotal_cents", "tax_cents", "service_charge_cents", "tip_cents", "total_cents", "currency", "payment_provider", "inventory_idempotency_key", "idempotency_key", "metadata", "created_at", "updated_at"],
  },
  {
    table: "pos_online_order_events",
    filterColumn: "location_id",
    columns: ["id", "location_id", "online_order_id", "event_type", "actor_type", "actor_id", "metadata", "created_at"],
    required: ["id", "location_id", "online_order_id", "event_type", "actor_type", "metadata", "created_at"],
  },
];

const deletionOrder = [...tableSpecs].reverse();

function transformRows(spec, rows) {
  return rows.map((row) => (spec.transform ? spec.transform(row) : { ...row }));
}

function validateRows(spec, rows) {
  for (const row of rows) {
    for (const column of spec.required) {
      if (row[column] === null || row[column] === undefined) {
        throw new Error(`source_row_not_shard_compatible:${spec.table}:${column}:${row.id || "unknown"}`);
      }
    }
  }
}

function writableBatches(table, rows) {
  const batches = [];
  let batch = [];
  let batchBytes = 2;
  for (const row of rows) {
    const rowJson = JSON.stringify(row);
    const rowBytes = Buffer.byteLength(rowJson, "utf8");
    if (rowBytes + 2 > MAX_UPSERT_BYTES) throw new Error(`row_too_large_for_initial_placement:${table}`);
    const separatorBytes = batch.length ? 1 : 0;
    if (batch.length && (batch.length >= MAX_UPSERT_ROWS || batchBytes + separatorBytes + rowBytes > MAX_UPSERT_BYTES)) {
      batches.push(batch);
      batch = [];
      batchBytes = 2;
    }
    batch.push(row);
    batchBytes += (batch.length > 1 ? 1 : 0) + rowBytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

const canonicalHash = (rows) =>
  createHash("sha256")
    .update(JSON.stringify([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(canonicalize)))
    .digest("hex");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const [location] = await globalRows(
  "locations",
  `id=eq.${encodeURIComponent(locationId)}&select=id,operational_shard_id,operational_shard_epoch,operational_writes_frozen`,
);
if (!location) throw new Error("location_not_found");
if (String(location.operational_shard_id || "primary") !== "primary") throw new Error("location_not_on_primary");
if (Number(location.operational_shard_epoch) !== expectedEpoch) throw new Error("assignment_epoch_mismatch");
if (location.operational_writes_frozen) throw new Error("location_already_frozen");

const [targetRegistry] = await globalRows(
  "operational_shards",
  `id=eq.${encodeURIComponent(targetLogicalShard)}&select=id,active_physical_shard_id,routing_epoch,schema_version,status,write_enabled`,
);
if (!targetRegistry) throw new Error("target_shard_registry_missing");
if (targetRegistry.status !== "active" || targetRegistry.write_enabled !== true) throw new Error("target_shard_not_writable");
if (Number(targetRegistry.schema_version) !== TARGET_SCHEMA_VERSION) throw new Error("target_schema_version_not_supported");

const targetPhysical = String(targetRegistry.active_physical_shard_id || targetLogicalShard);
const targetRoutingEpoch = Number(targetRegistry.routing_epoch || 1);
const target = config[targetPhysical];
if (!target?.url || !target?.serviceRoleKey) throw new Error("target_physical_shard_credentials_missing");
if (target.writeEnabled === false) throw new Error("target_runtime_write_disabled");

const targetUrl = String(target.url).replace(/\/$/, "");
const targetBypassToken = randomBytes(32).toString("hex");
const targetMutation = (path, init = {}) =>
  request(targetUrl, target.serviceRoleKey, path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "x-theouthaven-rebalance-token": targetBypassToken,
    },
  });

async function classifyAuthoritativeCutoverState() {
  try {
    const [current] = await globalRows(
      "locations",
      `id=eq.${encodeURIComponent(locationId)}&select=operational_shard_id,operational_shard_epoch,operational_writes_frozen`,
    );
    if (!current) return "ambiguous";
    const shardId = String(current.operational_shard_id || "primary");
    const epoch = Number(current.operational_shard_epoch || 0);
    const frozen = current.operational_writes_frozen === true;
    if (shardId === targetLogicalShard && epoch === expectedEpoch + 1 && !frozen) return "cutover";
    if (shardId === "primary" && epoch === expectedEpoch) return "pre_cutover";
    return "ambiguous";
  } catch {
    return "ambiguous";
  }
}

async function drainPrimaryCardTenders() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const initiated = await fetchAll(
      globalUrl,
      globalKey,
      "pos_tenders",
      `location_id=eq.${encodeURIComponent(locationId)}&tender_type=eq.card&status=eq.initiated`,
      ["id", "location_id", "status", "tender_type", "created_at", "metadata"],
    );
    const payments = await fetchAll(
      globalUrl,
      globalKey,
      "pos_payments",
      `location_id=eq.${encodeURIComponent(locationId)}`,
      ["id", "tender_id"],
    );
    const persistedTenderIds = new Set(payments.map((payment) => String(payment.tender_id || "")));
    const now = Date.now();
    let active = 0;

    for (const tender of initiated) {
      if (persistedTenderIds.has(String(tender.id))) continue;
      const started = Date.parse(String(tender.created_at || ""));
      const leaseExpiresAt = Number.isFinite(started) ? started + 2 * 60 * 1000 : Number.POSITIVE_INFINITY;
      if (leaseExpiresAt > now) {
        active += 1;
        continue;
      }
      await patchGlobal(
        "pos_tenders",
        `id=eq.${encodeURIComponent(tender.id)}&location_id=eq.${encodeURIComponent(locationId)}&status=eq.initiated`,
        {
          status: "voided",
          voided_at: new Date().toISOString(),
          metadata: {
            ...(tender.metadata && typeof tender.metadata === "object" ? tender.metadata : {}),
            auto_void_reason: "primary_initial_placement_stale_tender",
            auto_voided_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
      );
    }

    if (active === 0) return;
    await sleep(2000);
  }
  throw new Error("primary_in_flight_card_tenders_did_not_drain");
}

const moveId = randomUUID();
await insertGlobal("location_shard_moves", {
  id: moveId,
  location_id: locationId,
  source_shard_id: "primary",
  target_shard_id: targetLogicalShard,
  source_epoch: expectedEpoch,
  target_epoch: expectedEpoch + 1,
  source_schema_version: 1,
  target_schema_version: TARGET_SCHEMA_VERSION,
  status: "planned",
  started_at: new Date().toISOString(),
});

const manifest = {};
let sourceFenceFrozen = false;
let targetFenceInstalled = false;
let targetFenceReleased = false;
let globalFrozen = false;
let cutoverDone = false;

try {
  // Freezing this row waits for currently writing primary transactions because
  // every primary operational write holds a shared lock on the same row.
  sourceFenceFrozen = true;
  await setPrimaryFence(expectedEpoch, true, `initial-placement:${moveId}`);

  globalFrozen = true;
  const frozenRows = await patchGlobal(
    "locations",
    `id=eq.${encodeURIComponent(locationId)}&operational_shard_id=eq.primary&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.false`,
    { operational_writes_frozen: true },
    "return=representation",
  );
  if (!Array.isArray(frozenRows) || frozenRows.length !== 1) {
    throw new Error("global_primary_freeze_compare_and_swap_failed");
  }

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, { status: "copying" });
  await drainPrimaryCardTenders();

  targetFenceInstalled = true;
  await setTargetFence(target, expectedEpoch + 1, true, `initial-placement-target-copy:${moveId}`, targetBypassToken);

  for (const spec of deletionOrder) {
    const filter = `${spec.filterColumn}=eq.${encodeURIComponent(locationId)}`;
    await targetMutation(`/rest/v1/${spec.table}?${filter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  for (const spec of tableSpecs) {
    const filter = `${spec.filterColumn}=eq.${encodeURIComponent(locationId)}`;
    const sourceRowsRaw = await fetchAll(globalUrl, globalKey, spec.table, filter, spec.columns);
    const sourceRows = transformRows(spec, sourceRowsRaw);
    validateRows(spec, sourceRows);

    for (const batch of writableBatches(spec.table, sourceRows)) {
      await targetMutation(`/rest/v1/${spec.table}?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(batch),
      });
    }

    const targetRows = await fetchAll(targetUrl, target.serviceRoleKey, spec.table, filter, spec.columns);
    const sourceHash = canonicalHash(sourceRows);
    const targetHash = canonicalHash(targetRows);
    if (sourceRows.length !== targetRows.length || sourceHash !== targetHash) {
      throw new Error(`initial_placement_verification_failed:${spec.table}`);
    }
    manifest[spec.table] = { count: sourceRows.length, sha256: sourceHash };
  }

  const [finalTarget] = await globalRows(
    "operational_shards",
    `id=eq.${encodeURIComponent(targetLogicalShard)}&select=id,active_physical_shard_id,routing_epoch,schema_version,status,write_enabled`,
  );
  const [finalLocation] = await globalRows(
    "locations",
    `id=eq.${encodeURIComponent(locationId)}&select=operational_shard_id,operational_shard_epoch,operational_writes_frozen`,
  );
  if (
    !finalTarget ||
    !finalLocation ||
    String(finalLocation.operational_shard_id || "primary") !== "primary" ||
    Number(finalLocation.operational_shard_epoch) !== expectedEpoch ||
    finalLocation.operational_writes_frozen !== true ||
    String(finalTarget.active_physical_shard_id || targetLogicalShard) !== targetPhysical ||
    Number(finalTarget.routing_epoch || 1) !== targetRoutingEpoch ||
    Number(finalTarget.schema_version) !== TARGET_SCHEMA_VERSION ||
    finalTarget.status !== "active" ||
    finalTarget.write_enabled !== true
  ) {
    throw new Error("routing_changed_during_initial_placement");
  }

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "cutover_ready",
    verification: {
      sourcePhysical: "primary",
      targetPhysical,
      sourceRoutingEpoch: 1,
      targetRoutingEpoch,
      targetSchemaVersion: TARGET_SCHEMA_VERSION,
      pageSize: PAGE_SIZE,
      maxUpsertRows: MAX_UPSERT_ROWS,
      maxUpsertBytes: MAX_UPSERT_BYTES,
      sourceFence: "drained",
      targetSnapshot: "replaced",
      sourceRetention: "fenced",
    },
    data_manifest: manifest,
  });

  const cutoverRows = await patchGlobal(
    "locations",
    `id=eq.${encodeURIComponent(locationId)}&operational_shard_id=eq.primary&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.true`,
    {
      operational_shard_id: targetLogicalShard,
      operational_shard_epoch: expectedEpoch + 1,
      operational_writes_frozen: false,
    },
    "return=representation",
  );
  if (
    !Array.isArray(cutoverRows) ||
    cutoverRows.length !== 1 ||
    String(cutoverRows[0].operational_shard_id) !== targetLogicalShard ||
    Number(cutoverRows[0].operational_shard_epoch) !== expectedEpoch + 1 ||
    cutoverRows[0].operational_writes_frozen !== false
  ) {
    throw new Error("global_initial_placement_cutover_compare_and_swap_failed");
  }
  cutoverDone = true;
  globalFrozen = false;

  let targetReleased = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await setTargetFence(target, expectedEpoch + 1, false, `active-after-initial-placement:${moveId}`);
      targetReleased = true;
      targetFenceReleased = true;
      break;
    } catch (releaseError) {
      if (attempt === 2) throw releaseError;
      await sleep(1000);
    }
  }
  if (!targetReleased) throw new Error("target_fence_release_failed");

  // The primary copy remains intentionally fenced. It is rollback evidence and
  // a stale-writer trap, not an active operational source after cutover.
  await setPrimaryFence(expectedEpoch, true, `placed-to-${targetLogicalShard}:${moveId}`);

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "completed",
    cutover_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  console.log(JSON.stringify({
    moveId,
    locationId,
    sourceLogicalShard: "primary",
    targetLogicalShard,
    targetPhysical,
    targetRoutingEpoch,
    sourceFenceFrozen: true,
    manifest,
  }));
} catch (error) {
  if (!cutoverDone) {
    const authoritativeCutoverState = await classifyAuthoritativeCutoverState();
    if (authoritativeCutoverState === "cutover") {
      cutoverDone = true;
      globalFrozen = false;
    } else if (authoritativeCutoverState === "ambiguous") {
      if (targetFenceInstalled) {
        await setTargetFence(target, expectedEpoch + 1, true, `ambiguous-initial-placement:${moveId}`).catch(() => {});
      }
      await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
        status: "failed",
        failure_reason: error instanceof Error
          ? `ambiguous_cutover_state:${error.message}`
          : "ambiguous_cutover_state",
        data_manifest: manifest,
      }).catch(() => {});
      throw error;
    }
  }

  if (!cutoverDone) {
    if (targetFenceInstalled) {
      await setTargetFence(target, expectedEpoch + 1, true, `initial-placement-aborted:${moveId}`).catch(() => {});
    }
    if (globalFrozen) {
      await patchGlobal(
        "locations",
        `id=eq.${encodeURIComponent(locationId)}&operational_shard_id=eq.primary&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.true`,
        { operational_writes_frozen: false },
        "return=representation",
      ).catch(() => {});
    }
    if (sourceFenceFrozen) {
      await setPrimaryFence(expectedEpoch, false, `initial-placement-failed:${moveId}`).catch(() => {});
    }
    await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
      status: "failed",
      failure_reason: error instanceof Error ? error.message : "unknown_initial_placement_failure",
      data_manifest: manifest,
    }).catch(() => {});
  } else {
    if (targetFenceInstalled && !targetFenceReleased) {
      await setTargetFence(target, expectedEpoch + 1, true, `post-cutover-frozen:${moveId}`).catch(() => {});
    }
    await setPrimaryFence(expectedEpoch, true, `placed-to-${targetLogicalShard}:${moveId}`).catch(() => {});
    await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
      status: "completed",
      cutover_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      failure_reason: error instanceof Error ? `post_cutover_audit_retry:${error.message}` : "post_cutover_audit_retry",
    }).catch(() => {});
  }
  throw error;
}
