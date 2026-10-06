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

if (!globalUrl || !globalKey || !locationId || !targetLogicalShard || !Number.isInteger(expectedEpoch) || expectedEpoch < 1) {
  throw new Error("invalid_rebalance_configuration");
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

async function fetchAll(url, key, table, filterQuery) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const separator = filterQuery ? "&" : "";
    const page = await request(
      url,
      key,
      `/rest/v1/${table}?${filterQuery}${separator}select=*&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
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

async function upsertFence(shard, epoch, frozen, reason, bypassToken = "") {
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

const [location] = await globalRows(
  "locations",
  `id=eq.${encodeURIComponent(locationId)}&select=id,operational_shard_id,operational_shard_epoch,operational_writes_frozen`,
);
if (!location) throw new Error("location_not_found");
if (Number(location.operational_shard_epoch) !== expectedEpoch) throw new Error("assignment_epoch_mismatch");
if (location.operational_writes_frozen) throw new Error("location_already_frozen");

const sourceLogicalShard = String(location.operational_shard_id || "primary");
if (sourceLogicalShard === "primary" || targetLogicalShard === "primary" || sourceLogicalShard === targetLogicalShard) {
  throw new Error("unsupported_rebalance_route");
}

const shardRows = await globalRows(
  "operational_shards",
  `id=in.(${encodeURIComponent(sourceLogicalShard)},${encodeURIComponent(targetLogicalShard)})&select=id,active_physical_shard_id,routing_epoch,schema_version,status,write_enabled`,
);
const registry = Object.fromEntries(shardRows.map((row) => [row.id, row]));
const sourceRegistry = registry[sourceLogicalShard];
const targetRegistry = registry[targetLogicalShard];
if (!sourceRegistry || !targetRegistry) throw new Error("shard_registry_missing");
if (sourceRegistry.status !== "active" || targetRegistry.status !== "active" || targetRegistry.write_enabled !== true) {
  throw new Error("target_shard_not_writable");
}
if (Number(sourceRegistry.schema_version) !== Number(targetRegistry.schema_version)) {
  throw new Error("schema_version_mismatch");
}

const sourcePhysical = String(sourceRegistry.active_physical_shard_id || sourceLogicalShard);
const targetPhysical = String(targetRegistry.active_physical_shard_id || targetLogicalShard);
const sourceRoutingEpoch = Number(sourceRegistry.routing_epoch || 1);
const targetRoutingEpoch = Number(targetRegistry.routing_epoch || 1);
const source = config[sourcePhysical];
const target = config[targetPhysical];
if (!source?.url || !source?.serviceRoleKey || !target?.url || !target?.serviceRoleKey) {
  throw new Error("physical_shard_credentials_missing");
}
const sourceUrl = String(source.url).replace(/\/$/, "");
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

const moveId = randomUUID();
const tables = [
  ["locations", "id"],
  ["reserve_staff_profiles", "location_id"],
  ["layout_items", "location_id"],
  ["reservation_seating_resources", "location_id"],
  ["location_reservations", "location_id"],
  ["reservation_resource_assignments", "location_id"],
  ["pos_checks", "location_id"],
  ["pos_check_resources", "location_id"],
  ["pos_orders", "location_id"],
  ["pos_order_items", "location_id"],
  ["pos_tenders", "location_id"],
  ["pos_payments", "location_id"],
];

const deletionOrder = [...tables].reverse();

const generatedColumns = {
  pos_order_items: ["line_total_cents"],
  pos_tenders: ["total_cents"],
};

const writableRows = (table, rows) =>
  rows.map((row) => {
    const next = { ...row };
    for (const column of generatedColumns[table] || []) delete next[column];
    return next;
  });

function writableBatches(table, rows) {
  const batches = [];
  let batch = [];
  let batchBytes = 2;
  for (const row of writableRows(table, rows)) {
    const rowJson = JSON.stringify(row);
    const rowBytes = Buffer.byteLength(rowJson, "utf8");
    if (rowBytes + 2 > MAX_UPSERT_BYTES) {
      throw new Error(`row_too_large_for_rebalance:${table}`);
    }
    const separatorBytes = batch.length ? 1 : 0;
    if (
      batch.length &&
      (batch.length >= MAX_UPSERT_ROWS || batchBytes + separatorBytes + rowBytes > MAX_UPSERT_BYTES)
    ) {
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

const canonicalHash = (rows) =>
  createHash("sha256")
    .update(JSON.stringify([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))))
    .digest("hex");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (shardId === sourceLogicalShard && epoch === expectedEpoch) return "pre_cutover";
    return "ambiguous";
  } catch {
    return "ambiguous";
  }
}

await insertGlobal("location_shard_moves", {
  id: moveId,
  location_id: locationId,
  source_shard_id: sourceLogicalShard,
  target_shard_id: targetLogicalShard,
  source_epoch: expectedEpoch,
  target_epoch: expectedEpoch + 1,
  source_schema_version: sourceRegistry.schema_version,
  target_schema_version: targetRegistry.schema_version,
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
  // This update conflicts with the shared row lock every live shard write takes.
  // When it returns, already-running DB writes for the location have drained.
  // Record the attempted state before the network mutation so a committed
  // write with a lost response is still cleaned up correctly.
  sourceFenceFrozen = true;
  await upsertFence(source, expectedEpoch, true, `rebalance:${moveId}`);

  globalFrozen = true;
  const frozenRows = await patchGlobal(
    "locations",
    `id=eq.${encodeURIComponent(locationId)}&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.false`,
    { operational_writes_frozen: true },
    "return=representation",
  );
  if (!Array.isArray(frozenRows) || frozenRows.length !== 1) {
    throw new Error("global_freeze_compare_and_swap_failed");
  }

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, { status: "copying" });

  // A card flow can be outside Postgres while its PaymentIntent is being created.
  // Initiated tenders with a persisted pos_payments row are no longer in that
  // external-call window. The location fence blocks the next write for truly
  // in-flight calls, which then cancel and void through the cleanup allowance.
  let drained = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await request(sourceUrl, source.serviceRoleKey, "/rest/v1/rpc/pos_expire_stale_card_tenders", {
      method: "POST",
      body: JSON.stringify({ p_location_id: locationId }),
    });

    const initiated = await fetchAll(
      sourceUrl,
      source.serviceRoleKey,
      "pos_tenders",
      `location_id=eq.${encodeURIComponent(locationId)}&tender_type=eq.card&status=eq.initiated`,
    );
    const persistedPayments = await fetchAll(
      sourceUrl,
      source.serviceRoleKey,
      "pos_payments",
      `location_id=eq.${encodeURIComponent(locationId)}`,
    );
    const persistedTenderIds = new Set(persistedPayments.map((payment) => String(payment.tender_id || "")));
    const now = Date.now();
    const inFlight = initiated.filter((tender) => {
      if (persistedTenderIds.has(String(tender.id))) return false;
      const lease = tender.provider_call_lease_expires_at
        ? Date.parse(String(tender.provider_call_lease_expires_at))
        : Date.parse(String(tender.created_at || "")) + 2 * 60 * 1000;
      return !Number.isFinite(lease) || lease > now;
    });
    if (inFlight.length === 0) {
      drained = true;
      break;
    }
    await sleep(2000);
  }
  if (!drained) throw new Error("in_flight_card_tenders_did_not_drain");

  targetFenceInstalled = true;
  await upsertFence(target, expectedEpoch + 1, true, `rebalance-target-copy:${moveId}`, targetBypassToken);

  // Replays and move-backs must start from an exact empty tenant snapshot on
  // the target. Delete in reverse dependency order so rows removed on the
  // active source cannot survive from an older target snapshot.
  for (const [table, filterColumn] of deletionOrder) {
    const filter = `${filterColumn}=eq.${encodeURIComponent(locationId)}`;
    await targetMutation(`/rest/v1/${table}?${filter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  for (const [table, filterColumn] of tables) {
    const filter = `${filterColumn}=eq.${encodeURIComponent(locationId)}`;
    const sourceRows = await fetchAll(sourceUrl, source.serviceRoleKey, table, filter);
    if (sourceRows.length) {
      for (const batch of writableBatches(table, sourceRows)) {
        await targetMutation(`/rest/v1/${table}?on_conflict=id`, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(batch),
        });
      }
    }

    const targetRows = await fetchAll(targetUrl, target.serviceRoleKey, table, filter);
    const sourceHash = canonicalHash(sourceRows);
    const targetHash = canonicalHash(targetRows);
    if (sourceRows.length !== targetRows.length || sourceHash !== targetHash) {
      throw new Error(`verification_failed:${table}`);
    }
    manifest[table] = { count: sourceRows.length, sha256: sourceHash };
  }

  // Concurrency already serializes operator workflows, but revalidate the
  // authoritative registry at the last possible moment so an out-of-band
  // routing change also fails closed.
  const finalShardRows = await globalRows(
    "operational_shards",
    `id=in.(${encodeURIComponent(sourceLogicalShard)},${encodeURIComponent(targetLogicalShard)})&select=id,active_physical_shard_id,routing_epoch,status,write_enabled`,
  );
  const finalRegistry = Object.fromEntries(finalShardRows.map((row) => [row.id, row]));
  const finalSource = finalRegistry[sourceLogicalShard];
  const finalTarget = finalRegistry[targetLogicalShard];
  if (
    !finalSource ||
    !finalTarget ||
    String(finalSource.active_physical_shard_id || sourceLogicalShard) !== sourcePhysical ||
    String(finalTarget.active_physical_shard_id || targetLogicalShard) !== targetPhysical ||
    Number(finalSource.routing_epoch || 1) !== sourceRoutingEpoch ||
    Number(finalTarget.routing_epoch || 1) !== targetRoutingEpoch ||
    finalSource.status !== "active" ||
    finalTarget.status !== "active" ||
    finalTarget.write_enabled !== true
  ) {
    throw new Error("routing_changed_during_rebalance");
  }

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "cutover_ready",
    verification: {
      sourcePhysical,
      targetPhysical,
      sourceRoutingEpoch,
      targetRoutingEpoch,
      pageSize: PAGE_SIZE,
      maxUpsertRows: MAX_UPSERT_ROWS,
      maxUpsertBytes: MAX_UPSERT_BYTES,
      sourceFence: "drained",
      targetSnapshot: "replaced",
    },
    data_manifest: manifest,
  });

  const cutoverRows = await patchGlobal(
    "locations",
    `id=eq.${encodeURIComponent(locationId)}&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.true`,
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
    throw new Error("global_cutover_compare_and_swap_failed");
  }
  cutoverDone = true;
  globalFrozen = false;

  let targetReleased = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await upsertFence(target, expectedEpoch + 1, false, `active-after-rebalance:${moveId}`);
      targetReleased = true;
      targetFenceReleased = true;
      break;
    } catch (releaseError) {
      if (attempt === 2) throw releaseError;
      await sleep(1000);
    }
  }
  if (!targetReleased) throw new Error("target_fence_release_failed");

  // Keep the old physical location fenced permanently. Any stale client that
  // attempts a late write to the old shard is rejected after cutover.
  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "completed",
    cutover_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  console.log(JSON.stringify({
    moveId,
    locationId,
    sourceLogicalShard,
    targetLogicalShard,
    sourcePhysical,
    targetPhysical,
    sourceFenceFrozen: true,
    manifest,
  }));
} catch (error) {
  if (!cutoverDone) {
    const authoritativeCutoverState = await classifyAuthoritativeCutoverState();
    if (authoritativeCutoverState === "cutover") {
      // The cutover PATCH committed but its response was lost. Treat routing
      // as authoritative and never reopen the old source fence.
      cutoverDone = true;
      globalFrozen = false;
    } else if (authoritativeCutoverState === "ambiguous") {
      // Assignment cannot be proven either pre- or post-cutover. Preserve the
      // source fence and global freeze; keep the target fenced too.
      if (targetFenceInstalled) {
        await upsertFence(target, expectedEpoch + 1, true, `ambiguous-cutover:${moveId}`).catch(() => {});
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
      await upsertFence(target, expectedEpoch + 1, true, `rebalance-aborted:${moveId}`).catch(() => {});
    }
    if (globalFrozen) {
      await patchGlobal(
        "locations",
        `id=eq.${encodeURIComponent(locationId)}&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.true`,
        { operational_writes_frozen: false },
        "return=representation",
      ).catch(() => {});
    }
    if (sourceFenceFrozen) {
      await upsertFence(source, expectedEpoch, false, `rebalance-failed:${moveId}`).catch(() => {});
    }
    await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
      status: "failed",
      failure_reason: error instanceof Error ? error.message : "unknown_rebalance_failure",
      data_manifest: manifest,
    }).catch(() => {});
  } else {
    if (targetFenceInstalled && !targetFenceReleased) {
      await upsertFence(target, expectedEpoch + 1, true, `post-cutover-frozen:${moveId}`).catch(() => {});
    }
    // Routing has already committed. Never reopen the old physical shard.
    // Retry the audit completion once, but preserve the successful cutover
    // even if the audit row remains unavailable.
    await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
      status: "completed",
      cutover_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      failure_reason: error instanceof Error ? `post_cutover_audit_retry:${error.message}` : "post_cutover_audit_retry",
    }).catch(() => {});
  }
  throw error;
}
