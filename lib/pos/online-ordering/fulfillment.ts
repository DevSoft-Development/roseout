import "server-only";

import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { getUniversalLocationCatalog } from "@/lib/catalog/universalCatalog";

export type OnlineOrderOutputRole =
  | "receipt"
  | "kitchen_hot_line"
  | "kitchen_cold_line"
  | "bar"
  | "expo"
  | "prep";

function roleForPrepStation(value: string | null | undefined): OnlineOrderOutputRole {
  const station = String(value || "").trim().toLowerCase();
  if (station.includes("bar") || station.includes("drink")) return "bar";
  if (station.includes("expo")) return "expo";
  if (station.includes("cold") || station.includes("salad") || station.includes("dessert")) return "kitchen_cold_line";
  if (station.includes("prep")) return "prep";
  return "kitchen_hot_line";
}

function ticketHeader(order: Record<string, any>) {
  const pickup = order.promised_pickup_at
    ? new Date(order.promised_pickup_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    : "ASAP";
  return [
    "THEPOSHAVEN ONLINE PICKUP",
    `Order ${String(order.id).slice(0,8).toUpperCase()}`,
    `Customer: ${order.customer_name || "Guest"}`,
    `Pickup: ${pickup} UTC`,
    "--------------------------------",
  ];
}

function lineText(item: Record<string, any>) {
  const mods = Array.isArray(item.modifiers)
    ? item.modifiers.map((modifier: any) => `  + ${modifier.name || "Option"}`).join("\n")
    : "";
  const notes = item.notes ? `\n  NOTE: ${item.notes}` : "";
  return `${item.quantity}x ${item.item_name}${mods ? `\n${mods}` : ""}${notes}`;
}

export async function claimNextOnlineOrderFulfillment(input: {
  locationId: string;
  deviceId: string;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data: dispatchId, error: claimError } = await shard.client.rpc("pos_claim_online_order_dispatch", {
    p_location_id: input.locationId,
    p_device_id: input.deviceId,
  });
  if (claimError) throw new Error(claimError.message || "online_order_dispatch_claim_failed");
  if (!dispatchId) return null;

  const { data: dispatch, error: dispatchError } = await shard.client
    .from("pos_online_order_dispatches")
    .select("id,online_order_id,attempts")
    .eq("id", dispatchId)
    .single();
  if (dispatchError) throw new Error(dispatchError.message || "online_order_dispatch_read_failed");

  const { data: order, error: orderError } = await shard.client
    .from("pos_online_orders")
    .select("*")
    .eq("id", dispatch.online_order_id)
    .eq("location_id", input.locationId)
    .single();
  if (orderError) throw new Error(orderError.message || "online_order_read_failed");

  const [{ data: items, error: itemError }, { data: settings, error: settingsError }, catalog] = await Promise.all([
    shard.client
      .from("pos_order_items")
      .select("id,catalog_item_id,item_name,quantity,modifiers,notes,unit_price_cents,unit_modifier_total_cents")
      .eq("order_id", order.order_id)
      .eq("location_id", input.locationId)
      .neq("status", "voided")
      .order("created_at", { ascending: true }),
    shard.client
      .from("pos_ordering_settings")
      .select("auto_print,auto_accept,notification_settings")
      .eq("location_id", input.locationId)
      .maybeSingle(),
    getUniversalLocationCatalog(input.locationId, { channel: "pos", includeUnavailable: true }),
  ]);
  if (itemError) throw new Error(itemError.message || "online_order_items_read_failed");
  if (settingsError) throw new Error(settingsError.message || "online_order_settings_read_failed");

  const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
  const grouped = new Map<OnlineOrderOutputRole, Record<string, any>[]>();
  for (const item of items || []) {
    const catalogItem = item.catalog_item_id ? catalogById.get(String(item.catalog_item_id)) : null;
    const role = roleForPrepStation(catalogItem?.prepStation);
    grouped.set(role, [...(grouped.get(role) || []), item]);
  }

  const header = ticketHeader(order);
  const outputs: Array<{ role: OnlineOrderOutputRole | "receipt"; text: string }> = [];
  const allLines = (items || []).map(lineText);
  outputs.push({
    role: "receipt",
    text: [...header, ...allLines, "--------------------------------", `TOTAL: $${(Number(order.total_cents || 0) / 100).toFixed(2)}`, "\n"].join("\n"),
  });
  for (const [role, stationItems] of grouped.entries()) {
    outputs.push({
      role,
      text: [...header, `STATION: ${role.replaceAll("_"," ").toUpperCase()}`, ...stationItems.map(lineText), "\n"].join("\n"),
    });
  }

  return {
    dispatchId: String(dispatch.id),
    onlineOrderId: String(order.id),
    order: {
      id: String(order.id),
      status: String(order.status),
      customerName: String(order.customer_name || "Guest"),
      promisedPickupAt: order.promised_pickup_at,
      totalCents: Number(order.total_cents || 0),
    },
    notify: settings?.notification_settings?.pos !== false,
    autoPrint: settings?.auto_print !== false,
    outputs,
  };
}

export async function finishOnlineOrderFulfillment(input: {
  locationId: string;
  deviceId: string;
  dispatchId: string;
  success: boolean;
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { error } = await shard.client.rpc("pos_finish_online_order_dispatch", {
    p_location_id: input.locationId,
    p_dispatch_id: input.dispatchId,
    p_device_id: input.deviceId,
    p_success: input.success,
    p_error: input.error || null,
    p_metadata: input.metadata || {},
  });
  if (error) throw new Error(error.message || "online_order_dispatch_finish_failed");
}
