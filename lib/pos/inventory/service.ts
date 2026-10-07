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
  unitCode: string;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  preferredVendor: string | null;
  vendorSku: string | null;
};

function finiteNumber(value:unknown){
  if(value===null||value===undefined||value==="") return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function normalizeAvailability(row: Record<string, any>): PosInventoryAvailability {
  const trackingMode = row.tracking_mode === "quantity" ? "quantity" : "untracked";
  const quantityOnHand = finiteNumber(row.quantity_on_hand);
  const lowStockThreshold = finiteNumber(row.low_stock_threshold);
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
    unitCode:String(row.unit_code||"unit"),
    reorderPoint:finiteNumber(row.reorder_point),
    reorderQuantity:finiteNumber(row.reorder_quantity),
    preferredVendor:row.preferred_vendor==null?null:String(row.preferred_vendor),
    vendorSku:row.vendor_sku==null?null:String(row.vendor_sku),
  };
}

export async function getPosInventoryAvailability(
  locationId: string,
  catalogItemIds?: readonly string[],
) {
  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "read" });
  let query = shard.client
    .from("pos_inventory_items")
    .select("catalog_item_id,tracking_mode,quantity_on_hand,low_stock_threshold,manual_sold_out,sold_out_until,unit_code,reorder_point,reorder_quantity,preferred_vendor,vendor_sku")
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
  unitCode?: string;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  preferredVendor?: string | null;
  vendorSku?: string | null;
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
    unit_code: String(input.unitCode||"unit").trim().toLowerCase(),
    reorder_point: input.reorderPoint==null?null:Math.max(0,Number(input.reorderPoint)),
    reorder_quantity: input.reorderQuantity==null?null:Math.max(0,Number(input.reorderQuantity)),
    preferred_vendor: input.preferredVendor||null,
    vendor_sku: input.vendorSku||null,
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
  if(!Number.isFinite(input.quantityDelta)||input.quantityDelta===0) throw new Error("pos_inventory_invalid_adjustment");
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


export async function wastePosInventory(input:{
  locationId:string;catalogItemId:string;quantity:number;sourceId?:string|null;reason?:string|null;
}){
  const quantity=Number(input.quantity);
  if(!Number.isFinite(quantity)||quantity<=0) throw new Error("pos_inventory_invalid_waste_quantity");
  return adjustPosInventory({
    locationId:input.locationId,catalogItemId:input.catalogItemId,quantityDelta:-quantity,
    reason:input.reason||"waste",sourceType:"waste",sourceId:input.sourceId||null,
  });
}

export async function transferPosInventory(input:{
  locationId:string;catalogItemId:string;fromStockAreaId:string;toStockAreaId:string;quantity:number;sourceId?:string|null;
}){
  const quantity=Number(input.quantity);
  if(!Number.isFinite(quantity)||quantity<=0) throw new Error("pos_inventory_invalid_transfer_quantity");
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data,error}=await shard.client.rpc("pos_transfer_inventory",{
    p_location_id:input.locationId,p_catalog_item_id:input.catalogItemId,
    p_from_area_id:input.fromStockAreaId,p_to_area_id:input.toStockAreaId,
    p_quantity:quantity,p_source_id:input.sourceId||null,
  });
  if(error) throw new Error(error.message||"pos_inventory_transfer_failed");
  return {transferId:String(data||"")};
}


export async function createPosInventoryStockArea(input:{
  locationId:string;code:string;name:string;
}){
  const code=String(input.code||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  const name=String(input.name||"").trim();
  if(!code||!name) throw new Error("pos_inventory_invalid_stock_area");
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data,error}=await shard.client.from("pos_inventory_stock_areas")
    .upsert({
      location_id:input.locationId,code,name,is_active:true,updated_at:new Date().toISOString(),
    },{onConflict:"location_id,code"})
    .select("id,code,name,is_active,updated_at").single();
  if(error) throw new Error(error.message||"pos_inventory_stock_area_failed");
  return {
    id:String(data.id),code:String(data.code),name:String(data.name),
    isActive:data.is_active===true,updatedAt:data.updated_at,
  };
}
