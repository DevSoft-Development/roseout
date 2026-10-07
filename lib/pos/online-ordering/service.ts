import "server-only";

import { getUniversalLocationCatalog } from "@/lib/catalog/universalCatalog";
import { reservePosInventory, releasePosInventory } from "@/lib/pos/inventory/service";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPosPaymentProvider } from "@/lib/pos/payments/provider";
import { getStripeModeForLocation, getStripePublishableKey, stripeRequest } from "@/lib/stripe/server";
import { enqueuePosLocationCommand } from "@/lib/pos/device-command-service";
import { notifyOnlineOrderCustomer } from "@/lib/pos/online-ordering/notifications";

export type WebsiteOrderLineInput = {
  catalogItemId: string;
  quantity: number;
  modifierIds?: string[];
  notes?: string | null;
};

export type WebsiteOrderCustomerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

type OrderingSettings = {
  accepting_orders: boolean;
  auto_accept: boolean;
  auto_print: boolean;
  default_prep_minutes: number;
  prep_delay_minutes: number;
  paused_until: string | null;
  timezone: string;
  slot_minutes: number;
  max_orders_per_slot: number | null;
  cutoff_minutes_before_close: number;
  max_advance_days: number;
  tax_rate_bps: number;
  service_charge_bps: number;
  ordering_hours: Record<string, unknown>;
  pickup_instructions: string | null;
  notification_settings: Record<string, unknown>;
};

const DEFAULT_SETTINGS: OrderingSettings = {
  accepting_orders: true,
  auto_accept: true,
  auto_print: true,
  default_prep_minutes: 25,
  prep_delay_minutes: 0,
  paused_until: null,
  timezone: "America/New_York",
  slot_minutes: 15,
  max_orders_per_slot: null,
  cutoff_minutes_before_close: 15,
  max_advance_days: 7,
  tax_rate_bps: 0,
  service_charge_bps: 0,
  ordering_hours: {},
  pickup_instructions: null,
  notification_settings: { pos: true, push: true, email: false, sms: false },
};

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`online_order_missing_${field}`);
  return normalized;
}

function centsByBps(amount: number, bps: number) {
  return Math.max(0, Math.round((amount * Math.max(0, bps)) / 10_000));
}

function cleanSettings(row: Record<string, any> | null | undefined): OrderingSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    accepting_orders: row.accepting_orders !== false,
    auto_accept: row.auto_accept !== false,
    auto_print: row.auto_print !== false,
    default_prep_minutes: Number(row.default_prep_minutes || DEFAULT_SETTINGS.default_prep_minutes),
    prep_delay_minutes: Number(row.prep_delay_minutes || 0),
    paused_until: typeof row.paused_until === "string" ? row.paused_until : null,
    timezone: typeof row.timezone === "string" && row.timezone.trim() ? row.timezone.trim() : DEFAULT_SETTINGS.timezone,
    slot_minutes: Number(row.slot_minutes || DEFAULT_SETTINGS.slot_minutes),
    max_orders_per_slot: Number.isInteger(row.max_orders_per_slot) ? Number(row.max_orders_per_slot) : null,
    cutoff_minutes_before_close: Number(row.cutoff_minutes_before_close ?? DEFAULT_SETTINGS.cutoff_minutes_before_close),
    max_advance_days: Number(row.max_advance_days ?? DEFAULT_SETTINGS.max_advance_days),
    tax_rate_bps: Number(row.tax_rate_bps || 0),
    service_charge_bps: Number(row.service_charge_bps || 0),
    ordering_hours: row.ordering_hours && typeof row.ordering_hours === "object" ? row.ordering_hours : {},
    pickup_instructions: typeof row.pickup_instructions === "string" ? row.pickup_instructions : null,
    notification_settings:
      row.notification_settings && typeof row.notification_settings === "object"
        ? row.notification_settings
        : DEFAULT_SETTINGS.notification_settings,
  };
}

async function locationAndSettings(locationId: string) {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_charges_enabled,is_demo,demo_key,metadata")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "online_order_location_lookup_failed");
  if (!location?.id) throw new Error("online_order_location_not_found");

  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "read" });
  const { data: settingsRow, error: settingsError } = await shard.client
    .from("pos_ordering_settings")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message || "online_order_settings_read_failed");

  return { location: location as Record<string, any>, settings: cleanSettings(settingsRow as Record<string, any> | null) };
}

function localDayAndMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = String(parts.find((part) => part.type === "weekday")?.value || "").slice(0, 3).toLowerCase();
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return { weekday, minutes: hour * 60 + minute };
}

function minutesOfDay(value: unknown) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function assertOrderingHours(date: Date, settings: OrderingSettings) {
  const hours = settings.ordering_hours;
  if (!hours || !Object.keys(hours).length) return;
  const local = localDayAndMinutes(date, settings.timezone);
  const raw = (hours as Record<string, unknown>)[local.weekday];
  if (!Array.isArray(raw) || !raw.length) throw new Error("online_order_outside_ordering_hours");
  const windows = raw
    .map((entry) => Array.isArray(entry) ? entry : [])
    .map((entry) => ({ open: minutesOfDay(entry[0]), close: minutesOfDay(entry[1]) }))
    .filter((entry): entry is { open: number; close: number } => entry.open !== null && entry.close !== null);
  const allowed = windows.some(({ open, close }) => {
    if (close >= open) return local.minutes >= open && local.minutes <= close - settings.cutoff_minutes_before_close;
    return local.minutes >= open || local.minutes <= close - settings.cutoff_minutes_before_close;
  });
  if (!allowed) throw new Error("online_order_outside_ordering_hours");
}

function validateRequestedPickup(value: string | null | undefined, settings: OrderingSettings) {
  const now = Date.now();
  if (settings.paused_until && Date.parse(settings.paused_until) > now) {
    throw new Error("online_ordering_paused");
  }
  const prepMinutes = settings.default_prep_minutes + settings.prep_delay_minutes;
  const earliest = now + prepMinutes * 60_000;
  if (!value) return new Date(earliest).toISOString();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("online_order_invalid_pickup_time");
  const max = now + settings.max_advance_days * 24 * 60 * 60_000;
  if (parsed < earliest - 60_000) throw new Error("online_order_pickup_too_soon");
  if (parsed > max) throw new Error("online_order_pickup_too_far");
  const pickup = new Date(parsed);
  assertOrderingHours(pickup, settings);
  return pickup.toISOString();
}

function prepareLines(
  items: Awaited<ReturnType<typeof getUniversalLocationCatalog>>["items"],
  requested: readonly WebsiteOrderLineInput[],
) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const prepared: Array<{
    catalog_item_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    unit_modifier_total_cents: number;
    modifiers: Array<{ id: string; name: string; price_delta_cents: number }>;
    notes: string | null;
  }> = [];

  for (const raw of requested) {
    const catalogItemId = required(raw.catalogItemId, "catalog_item_id");
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new Error("online_order_invalid_quantity");
    }
    const item = itemMap.get(catalogItemId);
    if (!item || !item.isAvailable) throw new Error(`online_order_item_unavailable:${catalogItemId}`);
    if (!Number.isInteger(item.basePriceCents) || Number(item.basePriceCents) < 0) {
      throw new Error(`online_order_item_missing_price:${catalogItemId}`);
    }

    const requestedModifierIds = new Set((raw.modifierIds || []).map(String).filter(Boolean));
    const selected: Array<{ id: string; name: string; price_delta_cents: number }> = [];

    for (const group of item.modifiers) {
      const available = new Map(group.modifiers.filter((modifier) => modifier.isAvailable).map((modifier) => [modifier.id, modifier]));
      const groupSelected = [...requestedModifierIds]
        .filter((id) => available.has(id))
        .map((id) => available.get(id)!);
      if (groupSelected.length < group.minSelect || (group.maxSelect !== null && groupSelected.length > group.maxSelect)) {
        throw new Error(`online_order_modifier_selection_invalid:${group.id}`);
      }
      for (const modifier of groupSelected) {
        requestedModifierIds.delete(modifier.id);
        selected.push({
          id: modifier.id,
          name: modifier.name,
          price_delta_cents: modifier.priceDeltaCents,
        });
      }
    }
    if (requestedModifierIds.size) throw new Error("online_order_unknown_modifier");

    prepared.push({
      catalog_item_id: item.id,
      name: item.name,
      quantity,
      unit_price_cents: Number(item.basePriceCents),
      unit_modifier_total_cents: selected.reduce((sum, modifier) => sum + modifier.price_delta_cents, 0),
      modifiers: selected,
      notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : null,
    });
  }
  return prepared;
}

export async function getWebsiteOrderingCatalog(locationId: string) {
  const [{ settings }, catalog] = await Promise.all([
    locationAndSettings(locationId),
    getUniversalLocationCatalog(locationId, { channel: "online_ordering", includeUnavailable: true }),
  ]);
  const availability = await import("@/lib/pos/inventory/service").then(({ getPosInventoryAvailability }) =>
    getPosInventoryAvailability(locationId, catalog.items.map((item) => item.id)),
  );

  return {
    acceptingOrders: settings.accepting_orders,
    defaultPrepMinutes: settings.default_prep_minutes + settings.prep_delay_minutes,
    pausedUntil: settings.paused_until,
    maxAdvanceDays: settings.max_advance_days,
    pickupInstructions: settings.pickup_instructions,
    items: catalog.items.map((item) => {
      const stock = availability.get(item.id);
      const soldOut = item.isAvailable === false || stock?.soldOut === true;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        priceCents: item.basePriceCents,
        soldOut,
        lowStock: stock?.lowStock === true,
        modifiers: item.modifiers.map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          required: group.isRequired,
          modifiers: group.modifiers.filter((modifier) => modifier.isAvailable).map((modifier) => ({
            id: modifier.id,
            name: modifier.name,
            priceDeltaCents: modifier.priceDeltaCents,
          })),
        })),
      };
    }),
  };
}

export async function createWebsitePickupOrder(input: {
  locationId: string;
  idempotencyKey: string;
  customer: WebsiteOrderCustomerInput;
  requestedPickupAt?: string | null;
  tipCents?: number;
  lines: readonly WebsiteOrderLineInput[];
}) {
  const locationId = required(input.locationId, "location_id");
  const idempotencyKey = required(input.idempotencyKey, "idempotency_key").slice(0, 160);
  const customerName = required(input.customer?.name, "customer_name").slice(0, 160);
  const customerEmail = String(input.customer?.email || "").trim().slice(0, 320) || null;
  const customerPhone = String(input.customer?.phone || "").trim().slice(0, 80) || null;
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new Error("online_order_invalid_lines");

  const [{ location, settings }, catalog] = await Promise.all([
    locationAndSettings(locationId),
    getUniversalLocationCatalog(locationId, { channel: "online_ordering" }),
  ]);
  if (!settings.accepting_orders) throw new Error("online_ordering_paused");

  const connectedAccountId = String(location.stripe_connect_account_id || "").trim();
  if (!connectedAccountId || location.stripe_connect_charges_enabled !== true) {
    throw new Error("online_order_payments_unavailable");
  }

  const prepared = prepareLines(catalog.items, input.lines);
  const subtotalCents = prepared.reduce(
    (sum, line) => sum + line.quantity * (line.unit_price_cents + line.unit_modifier_total_cents),
    0,
  );
  const taxCents = centsByBps(subtotalCents, settings.tax_rate_bps);
  const serviceChargeCents = centsByBps(subtotalCents, settings.service_charge_bps);
  const tipCents = Number(input.tipCents || 0);
  if (!Number.isInteger(tipCents) || tipCents < 0 || tipCents > 100_000) throw new Error("online_order_invalid_tip");
  const totalCents = subtotalCents + taxCents + serviceChargeCents + tipCents;
  if (totalCents <= 0) throw new Error("online_order_invalid_total");

  const promisedPickupAt = validateRequestedPickup(input.requestedPickupAt, settings);
  if (settings.max_orders_per_slot !== null) {
    const slotMs = settings.slot_minutes * 60_000;
    const slotStart = new Date(Math.floor(Date.parse(promisedPickupAt) / slotMs) * slotMs).toISOString();
    const slotEnd = new Date(Date.parse(slotStart) + slotMs).toISOString();
    const readShard = await resolveOperationalShardForLocationId(locationId, { mode: "read" });
    const { count, error: slotError } = await readShard.client
      .from("pos_online_orders")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId)
      .gte("promised_pickup_at", slotStart)
      .lt("promised_pickup_at", slotEnd)
      .not("status", "in", '("canceled","completed")');
    if (slotError) throw new Error(slotError.message || "online_order_slot_check_failed");
    if (Number(count || 0) >= settings.max_orders_per_slot) throw new Error("online_order_slot_full");
  }
  const inventoryKey = `online-order:${idempotencyKey}`;
  await reservePosInventory({
    locationId,
    lines: prepared.map((line) => ({ catalogItemId: line.catalog_item_id, quantity: line.quantity })),
    sourceType: "online_ordering",
    sourceId: idempotencyKey,
    idempotencyKey: inventoryKey,
  });

  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "write" });
  let draft: any = null;
  let paymentIntent: any = null;
  const stripeMode = getStripeModeForLocation(location);
  const provider = getPosPaymentProvider({ provider: "stripe", stripeMode });

  try {
    const { data, error } = await shard.client.rpc("pos_create_online_order_draft", {
      p_location_id: locationId,
      p_idempotency_key: idempotencyKey,
      p_inventory_idempotency_key: inventoryKey,
      p_customer_name: customerName,
      p_customer_email: customerEmail,
      p_customer_phone: customerPhone,
      p_requested_pickup_at: input.requestedPickupAt || null,
      p_promised_pickup_at: promisedPickupAt,
      p_subtotal_cents: subtotalCents,
      p_tax_cents: taxCents,
      p_service_charge_cents: serviceChargeCents,
      p_tip_cents: tipCents,
      p_currency: "usd",
      p_lines: prepared,
      p_source: "website",
    });
    if (error) throw new Error(error.message || "online_order_draft_failed");
    draft = data as Record<string, any>;

    paymentIntent = await provider.createPaymentIntent({
      locationId,
      connectedAccountId,
      checkId: String(draft.check_id),
      orderId: String(draft.order_id),
      amountCents: totalCents,
      currency: "usd",
      tipCents,
      applicationFeeCents: 0,
      paymentMethodType: "card_not_present",
      idempotencyKey: `online-order-payment:${idempotencyKey}`,
      metadata: {
        type: "pos_online_order",
        online_order_id: String(draft.online_order_id),
        fulfillment: "pickup",
        source: "website",
      },
    });
    if (!paymentIntent.clientSecret) throw new Error("online_order_payment_client_secret_missing");

    const { error: paymentError } = await shard.client.from("pos_payments").upsert({
      location_id: locationId,
      check_id: draft.check_id,
      tender_id: draft.tender_id,
      provider: "stripe",
      provider_payment_intent_id: paymentIntent.providerPaymentIntentId,
      connected_account_id: connectedAccountId,
      idempotency_key: `online-order-payment:${idempotencyKey}`,
      status: paymentIntent.status === "unknown" ? "created" : paymentIntent.status,
      amount_cents: totalCents,
      tip_cents: tipCents,
      application_fee_cents: 0,
      payment_method_type: "card_not_present",
      metadata: { online_order_id: draft.online_order_id, source: "website" },
    }, { onConflict: "location_id,provider,idempotency_key" });
    if (paymentError) throw new Error(paymentError.message || "online_order_payment_persistence_failed");

    await shard.client
      .from("pos_online_orders")
      .update({ provider_payment_intent_id: paymentIntent.providerPaymentIntentId, updated_at: new Date().toISOString() })
      .eq("id", draft.online_order_id)
      .eq("location_id", locationId);

    return {
      onlineOrderId: String(draft.online_order_id),
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.providerPaymentIntentId,
      publishableKey: getStripePublishableKey(stripeMode),
      connectedAccountId,
      promisedPickupAt,
      amounts: { subtotalCents, taxCents, serviceChargeCents, tipCents, totalCents },
    };
  } catch (error) {
    if (paymentIntent?.providerPaymentIntentId) {
      await provider.cancelPaymentIntent({
        connectedAccountId,
        providerPaymentIntentId: paymentIntent.providerPaymentIntentId,
        reason: "abandoned",
      }).catch(() => null);
    }
    if (draft?.online_order_id) {
      try {
        await shard.client.rpc("pos_cancel_online_order", {
          p_location_id: locationId,
          p_online_order_id: draft.online_order_id,
          p_reason: "checkout_initialization_failed",
        });
      } catch {
        // Best-effort checkout cleanup; inventory release below remains authoritative.
      }
    }
    await releasePosInventory({ locationId, idempotencyKey: inventoryKey }).catch(() => null);
    throw error;
  }
}

type StripePaymentIntentRead = { id: string; status?: string };

export async function finalizeWebsitePickupOrder(input: {
  locationId: string;
  onlineOrderId: string;
}) {
  const locationId = required(input.locationId, "location_id");
  const onlineOrderId = required(input.onlineOrderId, "online_order_id");
  const { location, settings } = await locationAndSettings(locationId);
  const connectedAccountId = String(location.stripe_connect_account_id || "").trim();
  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "write" });

  const { data: onlineOrder, error } = await shard.client
    .from("pos_online_orders")
    .select("id,provider_payment_intent_id,status")
    .eq("id", onlineOrderId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "online_order_lookup_failed");
  if (!onlineOrder?.id) throw new Error("online_order_not_found");
  const paymentIntentId = required(onlineOrder.provider_payment_intent_id, "payment_intent_id");

  const paymentIntent = await stripeRequest<StripePaymentIntentRead>(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    { method: "GET", mode: getStripeModeForLocation(location), stripeAccount: connectedAccountId },
  );
  if (paymentIntent.status !== "succeeded") {
    return { onlineOrderId, status: onlineOrder.status, paymentStatus: paymentIntent.status || "unknown", finalized: false };
  }

  const { data, error: finalizeError } = await shard.client.rpc("pos_finalize_online_order_payment", {
    p_location_id: locationId,
    p_online_order_id: onlineOrderId,
    p_provider_payment_intent_id: paymentIntentId,
    p_auto_accept: settings.auto_accept,
  });
  if (finalizeError) throw new Error(finalizeError.message || "online_order_finalize_failed");
  await enqueuePosLocationCommand({
    locationId,
    commandType: "online_order_received",
    sourceType: "pos_online_order",
    sourceId: onlineOrderId,
    dedupeKey: `online-order-received:${onlineOrderId}`,
    payload: { online_order_id: onlineOrderId },
  });
  await notifyOnlineOrderCustomer({ locationId, onlineOrderId, status: "received" }).catch((error) => {
    console.error("ONLINE_ORDER_RECEIVED_NOTIFICATION_FAILED", { locationId, onlineOrderId, error });
  });
  return { ...(data as Record<string, unknown>), paymentStatus: "succeeded", finalized: true };
}

export async function failWebsitePickupOrder(input: {
  locationId: string;
  onlineOrderId: string;
  reason?: string | null;
}) {
  const locationId=required(input.locationId,"location_id");
  const onlineOrderId=required(input.onlineOrderId,"online_order_id");
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
  const { data: order,error }=await shard.client.from("pos_online_orders")
    .select("id,inventory_idempotency_key,status")
    .eq("id",onlineOrderId).eq("location_id",locationId).maybeSingle();
  if(error) throw new Error(error.message||"online_order_lookup_failed");
  if(!order) throw new Error("online_order_not_found");
  if(order.status==="completed"||order.status==="canceled") return {onlineOrderId,status:order.status};

  const reason=String(input.reason||"payment_failed").slice(0,160);
  const { error: cancelError }=await shard.client.rpc("pos_cancel_online_order",{
    p_location_id:locationId,
    p_online_order_id:onlineOrderId,
    p_reason:reason,
  });
  if(cancelError) throw new Error(cancelError.message||"online_order_cancel_failed");
  await releasePosInventory({
    locationId,
    idempotencyKey:String(order.inventory_idempotency_key),
    reason,
  });
  return {onlineOrderId,status:"canceled"};
}

export async function updateWebsitePickupOrderStatus(input: {
  locationId: string;
  onlineOrderId: string;
  status: "accepted"|"preparing"|"ready"|"completed"|"canceled";
  actorType?: string;
  actorId?: string | null;
}) {
  const locationId=required(input.locationId,"location_id");
  const onlineOrderId=required(input.onlineOrderId,"online_order_id");
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
  const { data,error }=await shard.client.rpc("pos_update_online_order_status",{
    p_location_id:locationId,
    p_online_order_id:onlineOrderId,
    p_status:input.status,
    p_actor_type:input.actorType||"device",
    p_actor_id:input.actorId||null,
  });
  if(error) throw new Error(error.message||"online_order_status_update_failed");

  await enqueuePosLocationCommand({
    locationId,
    commandType:"online_order_status_changed",
    sourceType:"pos_online_order",
    sourceId:onlineOrderId,
    dedupeKey:`online-order-status:${onlineOrderId}:${input.status}`,
    payload:{online_order_id:onlineOrderId,status:input.status},
  });

  if(input.status==="preparing"||input.status==="ready"){
    await notifyOnlineOrderCustomer({
      locationId,
      onlineOrderId,
      status:input.status,
    }).catch((notificationError)=>{
      console.error("ONLINE_ORDER_STATUS_NOTIFICATION_FAILED",{
        locationId,
        onlineOrderId,
        status:input.status,
        error:notificationError,
      });
    });
  }
  return data as Record<string,unknown>;
}
