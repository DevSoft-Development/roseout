import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sql = read("infra/supabase/operational-shards/online-ordering-v8.sql").toLowerCase();
const service = read("lib/pos/online-ordering/service.ts");
const bootstrap = read(".github/workflows/operational-shard-live-bootstrap.yml");
const fence = read("infra/supabase/operational-shards/write-fence-v3.sql");
const gateway = read("app/api/widgets/orders/route.ts");
const consumerGateway = read("apps/consumer/app/api/widgets/orders/route.ts");
const artifact = read("lib/websites/online-ordering-artifact.ts");
const websitePipeline = read("lib/websites/content-artifact.ts");
const websiteSnapshot = read("lib/websites/location-content.ts");

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

for (const token of [
  "originAllowed",
  "business_websites",
  "createWebsitePickupOrder",
  "finalizeWebsitePickupOrder",
]) {
  if (!gateway.includes(token) || !consumerGateway.includes(token)) {
    throw new Error(`Public website ordering gateway parity missing: ${token}`);
  }
}
for (const token of [
  'path: "order/index.html"',
  'href="/order/"',
  "Order Online",
  "js.stripe.com/v3",
  "/api/widgets/orders",
]) {
  if (!artifact.includes(token)) throw new Error(`Same-domain ordering artifact missing: ${token}`);
}
if (!websitePipeline.includes("addGeneratedWebsiteOnlineOrdering")) {
  throw new Error("Existing hosted website publish pipeline must attach online ordering.");
}
if (!websiteSnapshot.includes("online_ordering_enabled") || !websiteSnapshot.includes('"online_ordering"')) {
  throw new Error("Hosted website must derive ordering visibility from Universal Catalog.");
}

console.log("ThePOSHaven online ordering core verified.");
