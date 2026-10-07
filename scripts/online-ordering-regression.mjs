import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sql = read("infra/supabase/operational-shards/online-ordering-v8.sql").toLowerCase();
const service = read("lib/pos/online-ordering/service.ts");
const bootstrap = read(".github/workflows/operational-shard-live-bootstrap.yml");
const websiteArtifact = read("lib/websites/online-ordering-artifact.ts");
const websiteContent = read("lib/websites/content-artifact.ts");
const locationContent = read("lib/websites/location-content.ts");
const gateway = read("app/api/widgets/orders/route.ts");
const consumerGateway = read("apps/consumer/app/api/widgets/orders/route.ts");
const fence = read("infra/supabase/operational-shards/write-fence-v3.sql");

for (const token of [
  "create table if not exists public.pos_ordering_settings",
  "create table if not exists public.pos_online_orders",
  "create table if not exists public.pos_online_order_events",
  "pos_create_online_order_draft",
  "pos_finalize_online_order_payment",
  "pos_cancel_online_order",
  "auto_print",
  "max_orders_per_slot",
  "tax_rate_bps",
  "prep_delay_minutes",
  "paused_until",
  "timezone",
  "20261007_online_ordering_v8",
]) {
  if (!sql.includes(token)) throw new Error(`Missing online-ordering schema invariant: ${token}`);
}

for (const token of [
  'channel: "online_ordering"',
  "reservePosInventory",
  "releasePosInventory",
  "card_not_present",
  "getStripePublishableKey",
  "pos_create_online_order_draft",
  "pos_finalize_online_order_payment",
  "stripeRequest",
  "max_orders_per_slot",
  "online_order_slot_full",
  "online_order_outside_ordering_hours",
]) {
  if (!service.includes(token)) throw new Error(`Missing online-ordering service invariant: ${token}`);
}

if (service.includes("input.price") || service.includes("raw.price")) {
  throw new Error("Website order pricing must never trust browser-supplied price fields.");
}
if (!service.includes("item.basePriceCents") || !service.includes("modifier.priceDeltaCents")) {
  throw new Error("Website order pricing must derive from Universal Catalog.");
}
for (const table of ["pos_ordering_settings","pos_online_orders","pos_online_order_events"]) {
  if (!fence.includes(`'${table}'`)) throw new Error(`Online ordering table must participate in write fencing: ${table}`);
}
if (!bootstrap.includes("online-ordering-v8.sql") || !bootstrap.includes("schema_version=8")) {
  throw new Error("Shard bootstrap must apply and publish online-ordering schema v8.");
}
for (const token of ["order/index.html", "Order Online", "js.stripe.com/v3", "online_ordering_enabled"]) {
  if (!websiteArtifact.includes(token) && !locationContent.includes(token)) {
    throw new Error(`Generated Essentials+ website ordering integration missing: ${token}`);
  }
}
if (!websiteContent.includes("addGeneratedOnlineOrderingArtifact")) {
  throw new Error("Generated website publisher must add ordering to the existing site artifact.");
}
for (const route of [gateway, consumerGateway]) {
  for (const token of ["originAllowed", "business_websites", "Idempotency-Key", "64 * 1024", "Cache-Control"]) {
    if (!route.includes(token)) throw new Error(`Website ordering gateway missing security invariant: ${token}`);
  }
}
if (gateway.includes('"Access-Control-Allow-Origin": "*"') || consumerGateway.includes('"Access-Control-Allow-Origin": "*"')) {
  throw new Error("Website order creation must not allow arbitrary origins.");
}

console.log("ThePOSHaven online ordering core verified.");
