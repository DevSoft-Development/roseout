import { createHash, randomUUID } from "node:crypto";

const globalUrl = String(process.env.GLOBAL_SUPABASE_URL || "").replace(/\/$/, "");
const globalKey = String(process.env.GLOBAL_SUPABASE_SERVICE_ROLE_KEY || "");
const locationId = String(process.env.LOCATION_ID || "");
const targetLogicalShard = String(process.env.TARGET_SHARD_ID || "");
const expectedEpoch = Number(process.env.EXPECTED_ASSIGNMENT_EPOCH || "");
const config = JSON.parse(String(process.env.OPERATIONAL_SHARDS_JSON || "{}"));

if (!globalUrl || !globalKey || !locationId || !targetLogicalShard || !Number.isInteger(expectedEpoch) || expectedEpoch < 1) {
  throw new Error("invalid_rebalance_configuration");
}

const headers = (key, extra = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
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

async function globalRows(table, query) {
  return request(globalUrl, globalKey, `/rest/v1/${table}?${query}`);
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
  `id=in.(${encodeURIComponent(sourceLogicalShard)},${encodeURIComponent(targetLogicalShard)})&select=id,active_physical_shard_id,schema_version,status,write_enabled`,
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
const source = config[sourcePhysical];
const target = config[targetPhysical];
if (!source?.url || !source?.serviceRoleKey || !target?.url || !target?.serviceRoleKey) {
  throw new Error("physical_shard_credentials_missing");
}

const moveId = randomUUID();
const tables = [
  ["locations", "id"],
  ["reserve_staff_profiles", "location_id"],
  ["layout_items", "location_id"],
  ["reservation_seating_resources", "location_id"],
  ["location_reservations", "location_id"],
  ["pos_checks", "location_id"],
  ["pos_check_resources", "location_id"],
  ["pos_orders", "location_id"],
  ["pos_order_items", "location_id"],
  ["pos_tenders", "location_id"],
  ["pos_payments", "location_id"],
];

const canonicalHash = (rows) =>
  createHash("sha256")
    .update(JSON.stringify([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))))
    .digest("hex");

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

await patchGlobal("locations", `id=eq.${encodeURIComponent(locationId)}&operational_shard_epoch=eq.${expectedEpoch}`, {
  operational_writes_frozen: true,
});
await insertGlobal("location_shard_moves", {
  id: moveId,
  location_id: locationId,
  source_shard_id: sourceLogicalShard,
  target_shard_id: targetLogicalShard,
  source_epoch: expectedEpoch,
  target_epoch: expectedEpoch + 1,
  source_schema_version: sourceRegistry.schema_version,
  target_schema_version: targetRegistry.schema_version,
  status: "copying",
  started_at: new Date().toISOString(),
});

const manifest = {};
try {
  for (const [table, filterColumn] of tables) {
    const filter = `${filterColumn}=eq.${encodeURIComponent(locationId)}&select=*`;
    const sourceRows = await request(String(source.url).replace(/\/$/, ""), source.serviceRoleKey, `/rest/v1/${table}?${filter}`);
    if (sourceRows.length) {
      await request(String(target.url).replace(/\/$/, ""), target.serviceRoleKey, `/rest/v1/${table}?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(sourceRows),
      });
    }
    const targetRows = await request(String(target.url).replace(/\/$/, ""), target.serviceRoleKey, `/rest/v1/${table}?${filter}`);
    const sourceHash = canonicalHash(sourceRows);
    const targetHash = canonicalHash(targetRows);
    if (sourceRows.length !== targetRows.length || sourceHash !== targetHash) {
      throw new Error(`verification_failed:${table}`);
    }
    manifest[table] = { count: sourceRows.length, sha256: sourceHash };
  }

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "cutover_ready",
    verification: { sourcePhysical, targetPhysical },
    data_manifest: manifest,
  });

  await patchGlobal(
    "locations",
    `id=eq.${encodeURIComponent(locationId)}&operational_shard_epoch=eq.${expectedEpoch}&operational_writes_frozen=eq.true`,
    {
      operational_shard_id: targetLogicalShard,
      operational_shard_epoch: expectedEpoch + 1,
      operational_writes_frozen: false,
    },
  );

  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "completed",
    cutover_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  console.log(JSON.stringify({ moveId, locationId, sourceLogicalShard, targetLogicalShard, sourcePhysical, targetPhysical, manifest }));
} catch (error) {
  await patchGlobal("locations", `id=eq.${encodeURIComponent(locationId)}&operational_shard_epoch=eq.${expectedEpoch}`, {
    operational_writes_frozen: false,
  }).catch(() => {});
  await patchGlobal("location_shard_moves", `id=eq.${moveId}`, {
    status: "failed",
    failure_reason: error instanceof Error ? error.message : "unknown_rebalance_failure",
    data_manifest: manifest,
  }).catch(() => {});
  throw error;
}
