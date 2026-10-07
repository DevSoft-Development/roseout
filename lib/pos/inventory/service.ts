import "server-only";

import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

export type PosInventoryAvailability = {
  catalogItemId: string;
  trackingMode: "untracked" | "quantity";
  quantityOnHand: number | null;
  lowStockThreshold: number | null;
  manualSoldOut: boolean;
  soldOutUntil: string | null;
  lowStock: boolean;
  soldOut: boolean;
};

function normalizeAvailability(row: Record<string, any>): PosInventoryAvailability {
  const trackingMode = row.tracking_mode === "quantity" ? "quantity" : "untracked";
  const quantityOnHand = Number.isInteger(row.quantity_on_hand) ? Number(row.quantity_on_hand) : null;
  const lowStockThreshold = Number.isInteger(row.low_stock_threshold) ? Number(row.low_stock_threshold) : null;
  const temporarySoldOut =
    typeof row.sold_out_until === "string" &&
    Number.isFinite(Date.parse(row.sold_out_until)) &&
    Date.parse(row.sold_out_until) > Date.now();
  const soldOut =
    row.manual_sold_out === true ||
    temporarySoldOut ||
    (trackingMode === "quantity" && (quantityOnHand ?? 0) <= 0);

  return {
    catalogItemId: String(row.catalog_item_id),
    trackingMode,
    quantityOnHand,
    lowStockThreshold,
    manualSoldOut: row.manual_sold_out === true,
    soldOutUntil: typeof row.sold_out_until === "string" ? row.sold_out_until : null,
    lowStock:
      trackingMode === "quantity" &&
      lowStockThreshold !== null &&
      quantityOnHand !== null &&
      quantityOnHand <= lowStockThreshold,
    soldOut,
  };
}

export async function getPosInventoryAvailability(
  locationId: string,
  catalogItemIds?: readonly string[],
) {
  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "read" });
  let query = shard.client
    .from("pos_inventory_items")
    .select("catalog_item_id,tracking_mode,quantity_on_hand,low_stock_threshold,manual_sold_out,sold_out_until")
    .eq("location_id", locationId);

  const ids = (catalogItemIds || []).map(String).filter(Boolean);
  if (ids.length) query = query.in("catalog_item_id", ids);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "pos_inventory_read_failed");

  return new Map(
    ((data || []) as Record<string, any>[]).map((row) => {
      const normalized = normalizeAvailability(row);
      return [normalized.catalogItemId, normalized] as const;
    }),
  );
}

export async function reservePosInventory(input: {
  locationId: string;
  lines: readonly { catalogItemId: string; quantity: number }[];
  sourceType: "pos" | "online_ordering" | "qr_ordering" | "kiosk";
  sourceId: string;
  idempotencyKey: string;
}) {
  const lines = input.lines.map((line) => ({
    catalog_item_id: String(line.catalogItemId),
    quantity: Number(line.quantity),
  }));
  if (!lines.length || lines.some((line) => !line.catalog_item_id || !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("pos_inventory_invalid_lines");
  }

  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data, error } = await shard.client.rpc("pos_reserve_inventory", {
    p_location_id: input.locationId,
    p_lines: lines,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason || "reservation_released",
  });

  if (error) throw new Error(error.message || "pos_inventory_reservation_failed");
  return data as Record<string, unknown>;
}

export async function setPosInventoryItem(input: {
  locationId: string;
  catalogItemId: string;
  trackingMode: "untracked" | "quantity";
  quantityOnHand?: number | null;
  lowStockThreshold?: number | null;
  manualSoldOut?: boolean;
  soldOutReason?: string | null;
  soldOutUntil?: string | null;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const row = {
    location_id: input.locationId,
    catalog_item_id: input.catalogItemId,
    tracking_mode: input.trackingMode,
    quantity_on_hand:
      input.trackingMode === "quantity" ? Math.max(0, Number(input.quantityOnHand || 0)) : null,
    low_stock_threshold:
      input.lowStockThreshold == null ? null : Math.max(0, Number(input.lowStockThreshold)),
    manual_sold_out: input.manualSoldOut === true,
    sold_out_reason: input.soldOutReason || null,
    sold_out_until: input.soldOutUntil || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await shard.client
    .from("pos_inventory_items")
    .upsert(row, { onConflict: "location_id,catalog_item_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message || "pos_inventory_update_failed");
  return normalizeAvailability(data as Record<string, any>);
}

export async function adjustPosInventory(input: {
  locationId: string;
  catalogItemId: string;
  quantityDelta: number;
  reason: string;
  sourceType?: string;
  sourceId?: string | null;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data, error } = await shard.client.rpc("pos_adjust_inventory", {
    p_location_id: input.locationId,
    p_catalog_item_id: input.catalogItemId,
    p_quantity_delta: input.quantityDelta,
    p_reason: input.reason,
    p_source_type: input.sourceType || "manual",
    p_source_id: input.sourceId || null,
  });
  if (error) throw new Error(error.message || "pos_inventory_adjustment_failed");
  return normalizeAvailability(data as Record<string, any>);
}

export async function releasePosInventory(input: {
  locationId: string;
  idempotencyKey: string;
  reason?: string;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "write" });
  const { data, error } = await shard.client.rpc("pos_release_inventory", {
    p_location_id: input.locationId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(error.message || "pos_inventory_release_failed");
  return data as Record<string, unknown>;
}
