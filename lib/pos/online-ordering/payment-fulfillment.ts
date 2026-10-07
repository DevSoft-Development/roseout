import "server-only";

import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { releasePosInventory } from "@/lib/pos/inventory/service";
import { notifyOnlineOrderCustomer } from "@/lib/pos/online-ordering/status";

export async function fulfillPaidWebsitePickupOrder(input: {
  locationId: string;
  onlineOrderId: string;
  paymentIntentId: string;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data: settings, error: settingsError } = await shard.client
    .from("pos_ordering_settings")
    .select("auto_accept")
    .eq("location_id", input.locationId)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message || "online_order_settings_read_failed");

  const autoAccept = settings?.auto_accept !== false;
  const { data, error } = await shard.client.rpc("pos_finalize_online_order_payment", {
    p_location_id: input.locationId,
    p_online_order_id: input.onlineOrderId,
    p_provider_payment_intent_id: input.paymentIntentId,
    p_auto_accept: autoAccept,
  });
  if (error) throw new Error(error.message || "online_order_finalize_failed");

  await notifyOnlineOrderCustomer({
    locationId: input.locationId,
    onlineOrderId: input.onlineOrderId,
    status: autoAccept ? "accepted" : "received",
  }).catch(() => null);

  return data as Record<string, unknown>;
}

export async function failWebsitePickupOrderPayment(input: {
  locationId: string;
  onlineOrderId: string;
  reason?: string | null;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data: order, error } = await shard.client
    .from("pos_online_orders")
    .select("id,status,inventory_idempotency_key")
    .eq("id", input.onlineOrderId)
    .eq("location_id", input.locationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "online_order_read_failed");
  if (!order?.id) return { canceled: false, missing: true };
  if (order.status === "completed") return { canceled: false, completed: true };

  if (order.status !== "canceled") {
    const { error: cancelError } = await shard.client.rpc("pos_cancel_online_order", {
      p_location_id: input.locationId,
      p_online_order_id: input.onlineOrderId,
      p_reason: input.reason || "payment_failed",
    });
    if (cancelError) throw new Error(cancelError.message || "online_order_cancel_failed");
  }

  if (order.inventory_idempotency_key) {
    await releasePosInventory({
      locationId: input.locationId,
      idempotencyKey: String(order.inventory_idempotency_key),
      reason: input.reason || "payment_failed",
    });
  }
  return { canceled: true };
}
