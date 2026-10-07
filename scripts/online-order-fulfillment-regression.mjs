import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sql = read("infra/supabase/operational-shards/online-order-fulfillment-v9.sql").toLowerCase();
const authMigration = read("supabase/migrations/20261007022500_pos_device_api_credentials.sql").toLowerCase();
const deviceAuth = read("lib/pos/hardware/device-auth.ts");
const fulfillment = read("lib/pos/online-ordering/fulfillment.ts");
const paymentFulfillment = read("lib/pos/online-ordering/payment-fulfillment.ts");
const status = read("lib/pos/online-ordering/status.ts");
const deviceOrders = read("app/api/business/pos/devices/orders/route.ts");
const deviceOrdersIsolated = read("apps/business/app/api/business/pos/devices/orders/route.ts");
const webhook = read("app/api/stripe/connect/webhook/route.ts");
const webhookConsumer = read("apps/consumer/app/api/stripe/connect/webhook/route.ts");
const inbox = read("pos-mobile/lib/online-orders/inbox.ts");
const mobileHome = read("pos-mobile/app/index.tsx");
const mobileApp = read("pos-mobile/app.json");
const dr = read(".github/workflows/operational-shard-dr-replication.yml");
const failover = read(".github/workflows/operational-shard-failover.yml");
const bootstrap = read(".github/workflows/operational-shard-live-bootstrap.yml");
const hardwareDr = read(".github/workflows/pos-hardware-registry-dr-publication.yml");

for (const token of [
  "create table if not exists public.pos_online_order_dispatches",
  "pos_claim_online_order_dispatch",
  "pos_finish_online_order_dispatch",
  "pos_set_online_order_status",
  "after update on public.pos_payments",
  "new.status='succeeded'",
  "20261007_online_order_fulfillment_v9",
]) {
  if (!sql.includes(token)) throw new Error("Missing fulfillment schema invariant: " + token);
}
if (sql.includes("after update on public.pos_online_orders\nfor each row execute function public.pos_enqueue")) {
  throw new Error("Online-order dispatch must not be queued merely because an order row changes.");
}

for (const token of [
  "credential_hash",
  "code_hash",
  "enable row level security",
  "revoke all on table public.pos_device_api_credentials from public,anon,authenticated",
]) {
  if (!authMigration.includes(token)) throw new Error("Missing device credential invariant: " + token);
}
for (const token of ["createHash", "randomBytes", "claimPosDeviceCredential", "authenticatePosDeviceCredential"]) {
  if (!deviceAuth.includes(token)) throw new Error("Missing device auth service invariant: " + token);
}

for (const token of ["autoPrint", "kitchen_hot_line", "bar", "expo", "receipt", "pos_claim_online_order_dispatch"]) {
  if (!fulfillment.includes(token)) throw new Error("Missing local fulfillment invariant: " + token);
}
for (const token of ["fulfillPaidWebsitePickupOrder", "failWebsitePickupOrderPayment", "releasePosInventory"]) {
  if (!paymentFulfillment.includes(token)) throw new Error("Missing payment fulfillment invariant: " + token);
}
for (const token of ["sendRawBrandedEmail", "sendTransactionalSms", "pos_set_online_order_status"]) {
  if (!status.includes(token)) throw new Error("Missing customer notification invariant: " + token);
}

for (const route of [deviceOrders, deviceOrdersIsolated]) {
  for (const token of ["authenticatePosDeviceCredential", "claimNextOnlineOrderFulfillment", 'body.action === "status"', "setOnlineOrderStatus"]) {
    if (!route.includes(token)) throw new Error("Cashier fulfillment route parity missing: " + token);
  }
}
for (const route of [webhook, webhookConsumer]) {
  for (const token of ['case "payment_intent.succeeded"', '"pos_online_order"', "fulfillPaidWebsitePickupOrder", "failWebsitePickupOrderPayment"]) {
    if (!route.includes(token)) throw new Error("Stripe Connect fulfillment parity missing: " + token);
  }
}

for (const token of ["scheduleNotificationAsync", "autoPrint", "RoleBasedPosOutputRouter", "setOnlineOrderStatusFromCashier"]) {
  if (!inbox.includes(token)) throw new Error("Cashier inbox invariant missing: " + token);
}
for (const token of ["Preparing", "Ready", "Complete", "startOnlineOrderInboxLoop"]) {
  if (!mobileHome.includes(token)) throw new Error("Cashier UI status control missing: " + token);
}
if (inbox.includes("SUPABASE_SERVICE_ROLE_KEY") || mobileHome.includes("SUPABASE_SERVICE_ROLE_KEY") || mobileApp.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  throw new Error("Cashier runtime must never contain service-role credentials.");
}

for (const file of [dr, failover]) {
  if (!file.includes("pos_online_order_dispatches")) throw new Error("Fulfillment dispatches must participate in DR/failover.");
}
if (!bootstrap.includes("online-order-fulfillment-v9.sql") || !bootstrap.includes("schema_version=9")) {
  throw new Error("Shard bootstrap must apply fulfillment schema v9.");
}
for (const token of ["pos_device_claim_codes", "pos_device_api_credentials", "refresh publication"]) {
  if (!hardwareDr.includes(token)) throw new Error("Device credential DR publication missing: " + token);
}

console.log("ThePOSHaven online-order fulfillment verified.");
