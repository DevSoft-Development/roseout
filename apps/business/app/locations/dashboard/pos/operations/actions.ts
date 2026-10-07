"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { requireSignaturePlusAccess } from "@/lib/pos/access";
import {
  createPosInventoryStockArea,
  transferPosInventory,
  wastePosInventory,
} from "@/lib/pos/inventory/service";

function required(value:FormDataEntryValue|null,field:string){
  const text=String(value||"").trim();
  if(!text) throw new Error(`pos_stack6_missing_${field}`);
  return text;
}

function positiveNumber(value:FormDataEntryValue|null,field:string){
  const number=Number(value);
  if(!Number.isFinite(number)||number<=0) throw new Error(`pos_stack6_invalid_${field}`);
  return number;
}

async function requireInventoryManager(locationId:string){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) throw new Error("pos_stack6_auth_required");
  const access=await resolveLocationAccessContext({
    userId:user.id,userEmail:user.email,locationId,
  });
  if(access.canonicalLocationId!==locationId||!hasLocationPermission(access,"location.edit")){
    throw new Error("pos_stack6_forbidden");
  }
  await requireSignaturePlusAccess(locationId);
  return user;
}

export async function recordPosInventoryWaste(formData:FormData){
  const locationId=required(formData.get("locationId"),"location_id");
  const catalogItemId=required(formData.get("catalogItemId"),"catalog_item_id");
  const quantity=positiveNumber(formData.get("quantity"),"waste_quantity");
  const reason=String(formData.get("reason")||"waste").trim()||"waste";
  const user=await requireInventoryManager(locationId);
  await wastePosInventory({
    locationId,catalogItemId,quantity,reason,
    sourceId:`business:${user.id}`,
  });
  revalidatePath("/locations/dashboard/pos/operations");
}

export async function transferPosInventoryStock(formData:FormData){
  const locationId=required(formData.get("locationId"),"location_id");
  const catalogItemId=required(formData.get("catalogItemId"),"catalog_item_id");
  const fromStockAreaId=required(formData.get("fromStockAreaId"),"from_stock_area_id");
  const toStockAreaId=required(formData.get("toStockAreaId"),"to_stock_area_id");
  if(fromStockAreaId===toStockAreaId) throw new Error("pos_stack6_transfer_same_area");
  const quantity=positiveNumber(formData.get("quantity"),"transfer_quantity");
  const user=await requireInventoryManager(locationId);
  await transferPosInventory({
    locationId,catalogItemId,fromStockAreaId,toStockAreaId,quantity,
    sourceId:`business:${user.id}`,
  });
  revalidatePath("/locations/dashboard/pos/operations");
}

export async function createPosInventoryArea(formData:FormData){
  const locationId=required(formData.get("locationId"),"location_id");
  const name=required(formData.get("name"),"stock_area_name");
  const code=String(formData.get("code")||name).trim();
  await requireInventoryManager(locationId);
  await createPosInventoryStockArea({locationId,name,code});
  revalidatePath("/locations/dashboard/pos/operations");
}
