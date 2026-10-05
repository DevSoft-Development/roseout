import { randomUUID } from "node:crypto";

const config = JSON.parse(String(process.env.OPERATIONAL_SHARDS_JSON || "{}"));
for (const id of ["shard-01", "shard-02"]) {
  if (!config[id]?.url || !config[id]?.serviceRoleKey) throw new Error(`missing_${id}`);
}
if (config["shard-does-not-exist"]) throw new Error("unexpected_unknown_shard_configuration");

const call = async (shard, path, init = {}) => {
  const base = String(shard.url).replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: shard.serviceRoleKey,
      Authorization: `Bearer ${shard.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`http_${response.status}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
};

const a = { location: randomUUID(), check: randomUUID(), order: randomUUID() };
const b = { location: randomUUID(), check: randomUUID(), order: randomUUID() };
const s1 = config["shard-01"];
const s2 = config["shard-02"];

async function create(shard, ids, logical) {
  await call(shard, "/rest/v1/locations", { method: "POST", body: JSON.stringify({ id: ids.location, operational_shard_id: logical }) });
  await call(shard, "/rest/v1/pos_checks", { method: "POST", body: JSON.stringify({ id: ids.check, location_id: ids.location }) });
  await call(shard, "/rest/v1/pos_orders", { method: "POST", body: JSON.stringify({ id: ids.order, location_id: ids.location, check_id: ids.check }) });
}

async function cleanup(shard, ids) {
  for (const [table, id] of [["pos_orders", ids.order], ["pos_checks", ids.check], ["locations", ids.location]]) {
    await call(shard, `/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
  }
}

try {
  await create(s1, a, "shard-01");
  await create(s2, b, "shard-02");
  const [aWrong, bWrong, aOwn, bOwn] = await Promise.all([
    call(s2, `/rest/v1/pos_checks?id=eq.${a.check}&select=id`),
    call(s1, `/rest/v1/pos_checks?id=eq.${b.check}&select=id`),
    call(s1, `/rest/v1/pos_checks?id=eq.${a.check}&select=id`),
    call(s2, `/rest/v1/pos_checks?id=eq.${b.check}&select=id`),
  ]);
  if (aWrong.length || bWrong.length || aOwn.length !== 1 || bOwn.length !== 1) throw new Error("cross_shard_isolation_failed");
  console.log("Operational shard synthetic isolation proof passed.");
} finally {
  await cleanup(s1, a);
  await cleanup(s2, b);
}
