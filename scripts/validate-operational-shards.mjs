#!/usr/bin/env node

const raw = String(process.env.OPERATIONAL_SHARDS_JSON || "").trim();
const expected = String(process.env.EXPECTED_OPERATIONAL_SHARDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!raw) throw new Error("OPERATIONAL_SHARDS_JSON is required for multi-shard validation.");
const config = JSON.parse(raw);
if (!config || typeof config !== "object" || Array.isArray(config)) {
  throw new Error("OPERATIONAL_SHARDS_JSON must be an object keyed by shard id.");
}
for (const shardId of expected) {
  const shard = config[shardId];
  if (!shard?.url || !shard?.serviceRoleKey) throw new Error(`Missing configured shard: ${shardId}`);
  const response = await fetch(`${String(shard.url).replace(/\/$/, "")}/rest/v1/pos_checks?select=id&limit=1`, {
    headers: {
      apikey: shard.serviceRoleKey,
      Authorization: `Bearer ${shard.serviceRoleKey}`,
    },
  });
  if (!response.ok) throw new Error(`Shard ${shardId} schema probe failed with HTTP ${response.status}`);
  console.log(`${shardId}: reachable and POS schema available`);
}
if (expected.length < 2) throw new Error("Multi-shard validation requires at least two expected operational shards.");
console.log(`Validated ${expected.length} operational shards.`);
