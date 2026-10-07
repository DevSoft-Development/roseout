import "server-only";

import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { sendTransactionalSms } from "@/lib/sms/telnyx";

export type OnlineOrderCustomerStatus =
  | "received"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "canceled";

function statusCopy(status: OnlineOrderCustomerStatus) {
  switch (status) {
    case "received": return { heading: "We received your order", sms: "Your pickup order was received." };
    case "accepted": return { heading: "Your order is confirmed", sms: "Your pickup order is confirmed." };
    case "preparing": return { heading: "Your order is being prepared", sms: "Your pickup order is now being prepared." };
    case "ready": return { heading: "Your order is ready", sms: "Your pickup order is ready for pickup." };
    case "completed": return { heading: "Thanks for your order", sms: "Your pickup order is complete. Thank you!" };
    case "canceled": return { heading: "Your order was canceled", sms: "Your pickup order was canceled." };
  }
}

function enabled(settings: Record<string, unknown>, status: OnlineOrderCustomerStatus) {
  if (status === "accepted") return settings.received !== false;
  return settings[status] !== false;
}

export async function notifyOnlineOrderCustomer(input: {
  locationId: string;
  onlineOrderId: string;
  status: OnlineOrderCustomerStatus;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "read" });
  const [{ data: order, error: orderError }, { data: settings, error: settingsError }, { data: location }] =
    await Promise.all([
      shard.client
        .from("pos_online_orders")
        .select("id,customer_name,customer_email,customer_phone,promised_pickup_at,status")
        .eq("id", input.onlineOrderId)
        .eq("location_id", input.locationId)
        .maybeSingle(),
      shard.client
        .from("pos_ordering_settings")
        .select("customer_notification_settings")
        .eq("location_id", input.locationId)
        .maybeSingle(),
      supabaseAdmin
        .from("locations")
        .select("name,restaurant_name,activity_name")
        .eq("id", input.locationId)
        .maybeSingle(),
    ]);
  if (orderError) throw new Error(orderError.message || "online_order_notification_order_read_failed");
  if (settingsError) throw new Error(settingsError.message || "online_order_notification_settings_read_failed");
  if (!order?.id) throw new Error("online_order_not_found");

  const preferences =
    settings?.customer_notification_settings &&
    typeof settings.customer_notification_settings === "object"
      ? (settings.customer_notification_settings as Record<string, unknown>)
      : { email: true, sms: false, received: true, preparing: true, ready: true, completed: false };
  if (!enabled(preferences, input.status)) return { email: "skipped", sms: "skipped" };

  const locationName =
    String(location?.name || location?.restaurant_name || location?.activity_name || "ThePOSHaven");
  const copy = statusCopy(input.status);
  const pickup = order.promised_pickup_at
    ? new Date(order.promised_pickup_at).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : null;
  const detail = pickup && !["completed", "canceled"].includes(input.status)
    ? " Estimated pickup: " + pickup + "."
    : "";
  const customerName = String(order.customer_name || "there");
  const results: { email: string; sms: string } = { email: "skipped", sms: "skipped" };

  if (preferences.email !== false && order.customer_email) {
    const result = await sendRawBrandedEmail({
      to: String(order.customer_email),
      subject: copy.heading + " — " + locationName,
      heading: copy.heading,
      body: "Hi " + customerName + ", " + copy.sms + detail,
      department: "reservations",
    });
    results.email = result.status;
  }

  if (preferences.sms === true && order.customer_phone) {
    try {
      await sendTransactionalSms({
        to: String(order.customer_phone),
        body: locationName + ": " + copy.sms + detail,
      });
      results.sms = "sent";
    } catch {
      results.sms = "error";
    }
  }

  return results;
}

export async function setOnlineOrderStatus(input: {
  locationId: string;
  onlineOrderId: string;
  status: OnlineOrderCustomerStatus;
  actorType?: string;
  actorId?: string | null;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data, error } = await shard.client.rpc("pos_set_online_order_status", {
    p_location_id: input.locationId,
    p_online_order_id: input.onlineOrderId,
    p_status: input.status,
    p_actor_type: input.actorType || "device",
    p_actor_id: input.actorId || null,
  });
  if (error) throw new Error(error.message || "online_order_status_update_failed");

  if (["accepted", "preparing", "ready", "completed", "canceled"].includes(input.status)) {
    await notifyOnlineOrderCustomer({
      locationId: input.locationId,
      onlineOrderId: input.onlineOrderId,
      status: input.status,
    }).catch(() => null);
  }
  return data as Record<string, unknown>;
}
