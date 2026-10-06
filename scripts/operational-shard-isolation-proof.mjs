import { randomUUID } from "node:crypto";

const config = JSON.parse(String(process.env.OPERATIONAL_SHARDS_JSON || "{}"));
const globalUrl = String(process.env.GLOBAL_SUPABASE_URL || "").replace(/\/$/, "");
const globalKey = String(process.env.GLOBAL_SUPABASE_SERVICE_ROLE_KEY || "");

for (const id of ["shard-01", "shard-01-dr", "shard-02", "shard-02-dr"]) {
  if (!config[id]?.url || !config[id]?.serviceRoleKey) throw new Error(`missing_${id}`);
}
if (!globalUrl || !globalKey) throw new Error("missing_global_supabase_authority");
if (config["shard-does-not-exist"]) throw new Error("unexpected_unknown_shard_configuration");

const authHeaders = (key) => ({
  apikey: key,
  ...(String(key).startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
});

const call = async (shard, path, init = {}) => {
  const base = String(shard.url).replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...authHeaders(shard.serviceRoleKey),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`http_${response.status}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
};

const control = async (path) => {
  const response = await fetch(`${globalUrl}${path}`, {
    headers: authHeaders(globalKey),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`control_http_${response.status}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
};

const registryRows = await control(
  "/rest/v1/operational_shards?id=in.(shard-01,shard-02)&select=id,status,write_enabled,active_physical_shard_id,routing_epoch",
);
const registry = Object.fromEntries((registryRows || []).map((row) => [String(row.id), row]));

const activeShard = (logicalId, drId) => {
  const row = registry[logicalId];
  if (!row || row.status !== "active" || row.write_enabled !== true) {
    throw new Error(`inactive_${logicalId}`);
  }
  const physicalId = String(row.active_physical_shard_id || logicalId);
  if (physicalId !== logicalId && physicalId !== drId) {
    throw new Error(`invalid_active_physical_${logicalId}`);
  }
  const shard = config[physicalId];
  if (!shard?.url || !shard?.serviceRoleKey) throw new Error(`missing_${physicalId}`);
  return { shard, physicalId, routingEpoch: Number(row.routing_epoch || 0) };
};

const a = { location: randomUUID(), check: randomUUID(), order: randomUUID() };
const b = { location: randomUUID(), check: randomUUID(), order: randomUUID() };
const s1 = activeShard("shard-01", "shard-01-dr");
const s2 = activeShard("shard-02", "shard-02-dr");

async function create(target, ids, logical) {
  await call(target.shard, "/rest/v1/locations", {
    method: "POST",
    body: JSON.stringify({ id: ids.location, location_type: "restaurant", operational_shard_id: logical }),
  });
  await call(target.shard, "/rest/v1/pos_checks", {
    method: "POST",
    body: JSON.stringify({ id: ids.check, location_id: ids.location }),
  });
  await call(target.shard, "/rest/v1/pos_orders", {
    method: "POST",
    body: JSON.stringify({ id: ids.order, location_id: ids.location, check_id: ids.check }),
  });
}

async function cleanup(target, ids) {
  for (const [table, id] of [["pos_orders", ids.order], ["pos_checks", ids.check], ["locations", ids.location]]) {
    await call(target.shard, `/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
  }
  await call(
    target.shard,
    `/rest/v1/operational_location_write_fences?location_id=eq.${ids.location}`,
    { method: "DELETE" },
  ).catch(() => {});
}

try {
  await create(s1, a, "shard-01");
  await create(s2, b, "shard-02");
  const [aWrong, bWrong, aOwn, bOwn] = await Promise.all([
    call(s2.shard, `/rest/v1/pos_checks?id=eq.${a.check}&select=id`),
    call(s1.shard, `/rest/v1/pos_checks?id=eq.${b.check}&select=id`),
    call(s1.shard, `/rest/v1/pos_checks?id=eq.${a.check}&select=id`),
    call(s2.shard, `/rest/v1/pos_checks?id=eq.${b.check}&select=id`),
  ]);
  if (aWrong.length || bWrong.length || aOwn.length !== 1 || bOwn.length !== 1) {
    throw new Error("cross_shard_isolation_failed");
  }
  console.log(
    `Operational shard synthetic isolation proof passed: shard-01=${s1.physicalId}@${s1.routingEpoch}, shard-02=${s2.physicalId}@${s2.routingEpoch}`,
  );
} finally {
  await cleanup(s1, a);
  await cleanup(s2, b);
}
