import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const migration=read("supabase/migrations/20261007021000_pos_device_command_queue.sql").toLowerCase();
const service=read("lib/pos/device-command-service.ts");
const online=read("lib/pos/online-ordering/service.ts");
const notify=read("lib/pos/online-ordering/notifications.ts");
const webhook=read("app/api/stripe/connect/webhook/route.ts");
const consumerWebhook=read("apps/consumer/app/api/stripe/connect/webhook/route.ts");
const commands=read("app/api/pos/device/commands/route.ts");
const claim=read("app/api/pos/device/claim/route.ts");
const status=read("app/api/pos/device/orders/status/route.ts");
const mobileCloud=read("pos-mobile/lib/device/cloud.ts");
const dispatcher=read("pos-mobile/lib/device/command-dispatcher.ts");
const orderingSql=read("infra/supabase/operational-shards/online-ordering-v8.sql").toLowerCase();
const workspace=read("pos-mobile/app/index.tsx");
const localRouting=read("pos-mobile/lib/output/local-runtime.ts");
const configRoute=read("app/api/pos/device/config/route.ts");
const ordersRoute=read("app/api/pos/device/orders/route.ts");

for(const token of [
  "create table if not exists public.pos_device_claim_codes",
  "create table if not exists public.pos_device_credentials",
  "create table if not exists public.pos_location_commands",
  "credential_hash text not null unique",
  "enable row level security",
  "revoke all on table public.pos_device_credentials from public, anon, authenticated",
  "unique(location_id, dedupe_key)",
]) if(!migration.includes(token)) throw new Error(`Missing POS command schema invariant: ${token}`);

for(const token of [
  "crypto.timingSafeEqual",
  "credential_hash",
  "COMMAND_LEASE_MS",
  "MAX_COMMAND_ATTEMPTS",
  "dead_letter",
  "resolveOperationalShardForLocationId",
  "pos_online_orders",
]) if(!service.includes(token)) throw new Error(`Missing POS command service invariant: ${token}`);

if(service.includes("credential:credential")||migration.includes("credential text")) {
  throw new Error("Raw POS device credentials must never be persisted.");
}
for(const token of [
  "online_order_received",
  "online-order-received:",
  "notifyOnlineOrderCustomer",
  "pos_update_online_order_status",
]) if(!online.includes(token)) throw new Error(`Missing online order fulfillment invariant: ${token}`);

for(const token of ["payment_intent.succeeded","pos_online_order","finalizeWebsitePickupOrder","failWebsitePickupOrder"]) {
  if(!webhook.includes(token)||!consumerWebhook.includes(token)) throw new Error(`Stripe Connect fulfillment parity missing: ${token}`);
}
for(const token of ["authorization","x-pos-device-id","Cache-Control"]) {
  if(!commands.toLowerCase().includes(token.toLowerCase())||!status.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`Authenticated device server transport missing: ${token}`);
  }
}
for(const token of ["Authorization","X-Pos-Device-Id"]) {
  if(!mobileCloud.includes(token)) throw new Error(`Authenticated device mobile transport missing: ${token}`);
}
if(!claim.includes("claimPosDeviceCredential")||!mobileCloud.includes("posClaimTransport")) {
  throw new Error("POS claim transport must exist on server and mobile.");
}
for(const token of ["expo-notifications","Vibration.vibrate","receipt","kitchen_hot_line","expo","acknowledgePosDeviceCommand"]) {
  if(!dispatcher.includes(token)) throw new Error(`Mobile online-order dispatcher missing: ${token}`);
}
for(const token of ["sendSms","sendRawBrandedEmail","received","preparing","ready"]) {
  if(!notify.includes(token)) throw new Error(`Customer status notification invariant missing: ${token}`);
}
for(const token of ["pos_update_online_order_status","online_order_invalid_transition","order_status_changed"]) {
  if(!orderingSql.includes(token)) throw new Error(`Operational order status invariant missing: ${token}`);
}

for(const token of ["Online Orders","Accept","Start preparing","Mark ready","Complete pickup","fetchPosActiveOnlineOrders","pollAndDispatchPosCommands"]) {
  if(!workspace.includes(token)) throw new Error(`Cashier online-orders workspace missing: ${token}`);
}
for(const token of ["scanLocalDevices","serialNumber","providerDeviceId","savePosOutputRoutes","RoleBasedPosOutputRouter"]) {
  if(!localRouting.includes(token)) throw new Error(`Local output resolver missing: ${token}`);
}
for(const token of ["authenticatePosDeviceCredential","getPosDeviceOutputConfig","Cache-Control"]) {
  if(!configRoute.includes(token)) throw new Error(`POS config endpoint missing: ${token}`);
}
for(const token of ["authenticatePosDeviceCredential","listPosActiveOnlineOrders","Cache-Control"]) {
  if(!ordersRoute.includes(token)) throw new Error(`POS active-orders endpoint missing: ${token}`);
}

console.log("ThePOSHaven online-order fulfillment verified.");
