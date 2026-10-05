import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const migration = read("supabase/migrations/20261005133000_operational_shard_routing.sql").toLowerCase();
const resolver = read("lib/operational-shards.ts");
const payment = read("lib/pos/payments/check-payment-service.ts");
const catalog = read("lib/admin/credential-vault-catalog.ts");
const runtimeSource = read("lib/admin/credential-vault-runtime-source.ts");

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

if (/\b(service_role_key|service_role|password|api_key|credential_value)\b/i.test(migration)) {\n  throw new Error("Operational shard database metadata must never store shard credentials.");\n}

for (const token of [
  "OPERATIONAL_SHARDS_JSON",
  "operational_shard_unconfigured",
  "operational_shard_write_disabled",
  'shardId === "primary"',
  "getSupabaseAdminClient()",
]) {
  if (!resolver.includes(token)) throw new Error(`Missing shard resolver invariant: ${token}`);
}
if (resolver.includes('return getSupabaseAdminClient();\n  const config') === false) {
  throw new Error("Primary shard compatibility path is missing.");
}
if (!payment.includes("getOperationalShardClientForLocation")) {
  throw new Error("POS payment persistence must resolve its operational shard.");
}
if (payment.includes('supabaseAdmin.rpc("pos_begin_card_tender"')) {
  throw new Error("POS payment service must not use the global Supabase client for tenant transaction writes.");
}
if (!catalog.includes("operationalShardsJson") || !runtimeSource.includes("OPERATIONAL_SHARDS_JSON")) {
  throw new Error("Operational shard credentials must be managed through the centralized credential vault.");
}

console.log("Operational shard routing regression passed.");
