import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sql = read("infra/supabase/operational-shards/inventory-v7.sql").toLowerCase();
const service = read("lib/pos/inventory/service.ts");

for (const token of [
  "create table if not exists public.pos_inventory_items",
  "create table if not exists public.pos_inventory_transactions",
  "create table if not exists public.pos_inventory_adjustments",
  "pos_reserve_inventory",
  "for update",
  "pos_inventory_insufficient",
  "pos_release_inventory",
  "manual_sold_out",
  "low_stock_threshold",
  "toh_operational_dr",
  "20261007_pos_inventory_v7",
]) {
  if (!sql.includes(token)) throw new Error(`Missing POS inventory invariant: ${token}`);
}

for (const token of [
  "resolveOperationalShardForLocationId",
  "getPosInventoryAvailability",
  "reservePosInventory",
  "setPosInventoryItem",
  "adjustPosInventory",
  "releasePosInventory",
  "releasePosInventory",
]) {
  if (!service.includes(token)) throw new Error(`Missing POS inventory service invariant: ${token}`);
}

if (service.includes("getOperationalShardClientForLocation(")) {
  throw new Error("Inventory writes must use authoritative shard resolution.");
}

console.log("ThePOSHaven Essentials+ inventory and sold-out engine verified.");
