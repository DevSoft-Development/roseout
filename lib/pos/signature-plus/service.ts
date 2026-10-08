import "server-only";

import { getUniversalLocationCatalog } from "@/lib/catalog/universalCatalog";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { adjustPosInventory, getPosInventoryAvailability } from "@/lib/pos/inventory/service";
import { enqueuePosLocationCommand } from "@/lib/pos/device-command-service";
import { createCheckCardPayment } from "@/lib/pos/payments/check-payment-service";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CourseState="sent"|"fired"|"fulfilled";
type SplitMode="by_guest"|"even"|"custom";

function required(value:unknown,field:string){
  const text=String(value??"").trim();
  if(!text) throw new Error(`pos_signature_missing_${field}`);
  return text;
}
function safeMetadata(value:unknown){
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
}
function now(){return new Date().toISOString();}

async function notify(locationId:string,sourceType:string,sourceId:string,payload:Record<string,unknown>={}){
  return enqueuePosLocationCommand({
    locationId,
    commandType:"pos_state_changed",
    sourceType,
    sourceId,
    dedupeKey:`pos-state:${sourceType}:${sourceId}:${Date.now()}`,
    payload,
  }).catch(()=>null);
}

export async function listSignaturePlusKds(input:{locationId:string;station?:string|null}){
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"read"});
  const {data:orders,error}=await shard.client.from("pos_orders")
    .select("id,check_id,status,course_name,sent_at,fired_at,fulfilled_at,metadata,created_at")
    .eq("location_id",input.locationId)
    .in("status",["sent","fired"])
    .order("sent_at",{ascending:true});
  if(error) throw new Error(error.message||"pos_signature_kds_orders_failed");
  const orderIds=(orders||[]).map((row:any)=>String(row.id));
  const {data:items,error:itemError}=orderIds.length
    ? await shard.client.from("pos_order_items")
        .select("id,order_id,check_id,catalog_item_id,item_name,seat_number,quantity,modifiers,notes,status,created_at")
        .eq("location_id",input.locationId).in("order_id",orderIds).neq("status","voided")
        .order("created_at",{ascending:true})
    : {data:[],error:null};
  if(itemError) throw new Error(itemError.message||"pos_signature_kds_items_failed");

  const catalog=await getUniversalLocationCatalog(input.locationId,{channel:"pos",includeUnavailable:true});
  const catalogById=new Map(catalog.items.map((item:any)=>[String(item.id),item]));
  const checkIds=Array.from(new Set((orders||[]).map((row:any)=>String(row.check_id))));
  const {data:resources,error:resourceError}=checkIds.length
    ? await shard.client.from("pos_check_resources")
        .select("check_id,resource_label,layout_item_id")
        .eq("location_id",input.locationId).in("check_id",checkIds)
    : {data:[],error:null};
  if(resourceError) throw new Error(resourceError.message||"pos_signature_kds_resources_failed");
  const labels=new Map<string,string[]>();
  for(const row of resources||[]){
    const list=labels.get(String(row.check_id))||[];
    if(row.resource_label) list.push(String(row.resource_label));
    labels.set(String(row.check_id),list);
  }

  const tickets=(orders||[]).map((order:any)=>{
    const lines=(items||[]).filter((item:any)=>String(item.order_id)===String(order.id)).map((item:any)=>{
      const catalogItem=catalogById.get(String(item.catalog_item_id||"")) as any;
      const station=String(catalogItem?.prepStation||catalogItem?.metadata?.prep_station||catalogItem?.metadata?.station||"kitchen").trim().toLowerCase();
      return {
        id:String(item.id),
        name:String(item.item_name||"Item"),
        seatNumber:item.seat_number==null?null:Number(item.seat_number),
        quantity:Number(item.quantity||1),
        modifiers:Array.isArray(item.modifiers)?item.modifiers:[],
        notes:item.notes||null,
        status:String(item.status||order.status),
        station,
      };
    });
    const stations=Array.from(new Set(lines.map((line:any)=>line.station)));
    return {
      id:String(order.id),
      checkId:String(order.check_id),
      tableLabels:labels.get(String(order.check_id))||[],
      course:String(order.course_name||"other"),
      status:String(order.status),
      held:safeMetadata(order.metadata).hold===true,
      sentAt:order.sent_at||order.created_at,
      firedAt:order.fired_at||null,
      elapsedSeconds:Math.max(0,Math.floor((Date.now()-Date.parse(order.sent_at||order.created_at))/1000)),
      stations,
      lines,
    };
  }).filter((ticket:any)=>!input.station||ticket.lines.some((line:any)=>line.station===String(input.station).toLowerCase()));

  return tickets;
}

const UNIT_TO_BASE:Record<string,{family:string;factor:number}>={
  unit:{family:"count",factor:1},each:{family:"count",factor:1},portion:{family:"count",factor:1},bottle:{family:"count",factor:1},
  oz:{family:"mass",factor:1},lb:{family:"mass",factor:16},
  ml:{family:"volume",factor:1},l:{family:"volume",factor:1000},
  tsp:{family:"volume",factor:4.92892},tbsp:{family:"volume",factor:14.7868},cup:{family:"volume",factor:236.588},
};
function convertIngredientQuantity(quantity:number,fromUnit:string,toUnit:string){
  const from=UNIT_TO_BASE[String(fromUnit||"unit").toLowerCase()];
  const to=UNIT_TO_BASE[String(toUnit||"unit").toLowerCase()];
  if(!from||!to||from.family!==to.family) throw new Error("pos_signature_recipe_unit_mismatch");
  return Number(((quantity*from.factor)/to.factor).toFixed(4));
}

async function consumeRecipeIngredients(locationId:string,orderId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:lines,error}=await shard.client.from("pos_order_items")
    .select("catalog_item_id,quantity").eq("location_id",locationId).eq("order_id",orderId).neq("status","voided");
  if(error) throw new Error(error.message||"pos_signature_recipe_lines_failed");
  const catalog=await getUniversalLocationCatalog(locationId,{channel:"pos",includeUnavailable:true});
  const byId=new Map(catalog.items.map((item:any)=>[String(item.id),item]));
  const deltas=new Map<string,number>();
  for(const line of lines||[]){
    const item=byId.get(String(line.catalog_item_id||"")) as any;
    const recipe=Array.isArray(item?.metadata?.recipe)?item.metadata.recipe:[];
    for(const component of recipe){
      const ingredientId=String(component?.catalogItemId||component?.catalog_item_id||"");
      const units=Number(component?.quantity||component?.units||0);
      if(!ingredientId||!Number.isFinite(units)||units<=0) continue;
      const ingredient=byId.get(ingredientId) as any;
      const recipeUnit=String(component?.unit||ingredient?.metadata?.inventory_unit||"unit");
      const inventoryUnit=String(ingredient?.metadata?.inventory_unit||recipeUnit);
      const normalized=convertIngredientQuantity(units,recipeUnit,inventoryUnit);
      deltas.set(ingredientId,Number(((deltas.get(ingredientId)||0)-(normalized*Number(line.quantity||1))).toFixed(4)));
    }
  }
  for(const [catalogItemId,quantityDelta] of deltas){
    await adjustPosInventory({
      locationId,catalogItemId,quantityDelta,
      reason:"recipe_usage",sourceType:"signature_plus_recipe",sourceId:orderId,
    });
  }
  return Object.fromEntries(deltas);
}

export async function setSignaturePlusCourseState(input:{
  locationId:string;orderId:string;action:"hold"|"release_hold"|"fire"|"ready";
}){
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data:order,error}=await shard.client.from("pos_orders")
    .select("id,status,metadata").eq("location_id",input.locationId).eq("id",input.orderId).maybeSingle();
  if(error||!order) throw new Error(error?.message||"pos_signature_order_not_found");
  const metadata=safeMetadata(order.metadata);
  if(input.action==="hold"||input.action==="release_hold"){
    const {error:updateError}=await shard.client.from("pos_orders").update({
      metadata:{...metadata,hold:input.action==="hold",hold_updated_at:now()},updated_at:now(),
    }).eq("location_id",input.locationId).eq("id",input.orderId);
    if(updateError) throw new Error(updateError.message||"pos_signature_hold_failed");
  }else if(input.action==="fire"){
    if(!["sent","fired"].includes(String(order.status))) throw new Error("pos_signature_order_not_fireable");
    if(String(order.status)!=="fired"){
      await consumeRecipeIngredients(input.locationId,input.orderId);
    }
    const firedAt=now();
    const {error:itemError}=await shard.client.from("pos_order_items")
      .update({status:"fired",updated_at:firedAt})
      .eq("location_id",input.locationId).eq("order_id",input.orderId).in("status",["sent","active"]);
    if(itemError) throw new Error(itemError.message||"pos_signature_fire_items_failed");
    const {error:updateError}=await shard.client.from("pos_orders").update({
      status:"fired",fired_at:firedAt,metadata:{...metadata,hold:false},updated_at:firedAt,
    }).eq("location_id",input.locationId).eq("id",input.orderId);
    if(updateError) throw new Error(updateError.message||"pos_signature_fire_failed");
  }else{
    const fulfilledAt=now();
    const {error:itemError}=await shard.client.from("pos_order_items")
      .update({status:"fulfilled",updated_at:fulfilledAt})
      .eq("location_id",input.locationId).eq("order_id",input.orderId).neq("status","voided");
    if(itemError) throw new Error(itemError.message||"pos_signature_ready_items_failed");
    const {error:updateError}=await shard.client.from("pos_orders").update({
      status:"fulfilled",fulfilled_at:fulfilledAt,updated_at:fulfilledAt,
    }).eq("location_id",input.locationId).eq("id",input.orderId);
    if(updateError) throw new Error(updateError.message||"pos_signature_ready_failed");
  }
  await notify(input.locationId,"pos_order",input.orderId,{action:input.action});
  return listSignaturePlusKds({locationId:input.locationId});
}

async function activeCheckForTable(locationId:string,layoutItemId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:links,error}=await shard.client.from("pos_check_resources")
    .select("check_id").eq("location_id",locationId).eq("layout_item_id",layoutItemId);
  if(error) throw new Error(error.message||"pos_signature_table_links_failed");
  const ids=(links||[]).map((row:any)=>String(row.check_id));
  if(!ids.length) return null;
  const {data,error:checkError}=await shard.client.from("pos_checks")
    .select("id").eq("location_id",locationId).in("id",ids).in("status",["open","held"]).limit(1).maybeSingle();
  if(checkError) throw new Error(checkError.message||"pos_signature_table_check_failed");
  return data?.id?String(data.id):null;
}

export async function moveOrMergeSignaturePlusTable(input:{
  locationId:string;checkId:string;targetLayoutItemId:string;mode:"move"|"merge";
}){
  const targetId=required(input.targetLayoutItemId,"target_table");
  const occupied=await activeCheckForTable(input.locationId,targetId);
  if(occupied&&occupied!==input.checkId) throw new Error("pos_signature_target_table_has_open_check");
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data:table,error:tableError}=await shard.client.from("layout_items")
    .select("item_name,item_number").eq("location_id",input.locationId).eq("id",targetId).maybeSingle();
  if(tableError||!table) throw new Error(tableError?.message||"pos_signature_target_table_not_found");
  if(input.mode==="move"){
    const {error}=await shard.client.from("pos_check_resources")
      .delete().eq("location_id",input.locationId).eq("check_id",input.checkId);
    if(error) throw new Error(error.message||"pos_signature_move_unlink_failed");
  }
  const {error:linkError}=await shard.client.from("pos_check_resources").upsert({
    location_id:input.locationId,check_id:input.checkId,layout_item_id:targetId,
    resource_label:String(table.item_name||table.item_number||"Table"),
  },{onConflict:"check_id,layout_item_id"});
  if(linkError) throw new Error(linkError.message||"pos_signature_table_link_failed");
  await notify(input.locationId,"pos_check",input.checkId,{action:input.mode,targetLayoutItemId:targetId});
  return {ok:true};
}

export async function transferSignaturePlusServer(input:{
  locationId:string;checkId:string;staffProfileId:string;
}){
  const staffProfileId=required(input.staffProfileId,"staff_profile_id");
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data:staff,error:staffError}=await shard.client.from("reserve_staff_profiles")
    .select("id,display_name,role,is_active").eq("location_id",input.locationId).eq("id",staffProfileId).eq("is_active",true).maybeSingle();
  if(staffError||!staff) throw new Error(staffError?.message||"pos_signature_staff_not_found");
  const stamp=now();
  const {error:checkError}=await shard.client.from("pos_checks")
    .update({server_staff_profile_id:staffProfileId,updated_at:stamp})
    .eq("location_id",input.locationId).eq("id",input.checkId).in("status",["open","held"]);
  if(checkError) throw new Error(checkError.message||"pos_signature_transfer_check_failed");
  const {error:orderError}=await shard.client.from("pos_orders")
    .update({server_staff_profile_id:staffProfileId,updated_at:stamp})
    .eq("location_id",input.locationId).eq("check_id",input.checkId).in("status",["draft","sent","fired"]);
  if(orderError) throw new Error(orderError.message||"pos_signature_transfer_orders_failed");
  await notify(input.locationId,"pos_check",input.checkId,{action:"transfer_server",staffProfileId});
  return {staffProfileId,displayName:String(staff.display_name||"Staff")};
}

export async function buildSignaturePlusSplit(input:{
  locationId:string;checkId:string;mode:SplitMode;parts?:number;custom?:Record<string,number>;
}){
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data:check,error:checkError}=await shard.client.from("pos_checks")
    .select("id,guest_count,total_cents,metadata").eq("location_id",input.locationId).eq("id",input.checkId).maybeSingle();
  if(checkError||!check) throw new Error(checkError?.message||"pos_signature_check_not_found");
  const {data:items,error:itemError}=await shard.client.from("pos_order_items")
    .select("id,seat_number,line_total_cents,status").eq("location_id",input.locationId).eq("check_id",input.checkId).neq("status","voided");
  if(itemError) throw new Error(itemError.message||"pos_signature_split_items_failed");

  let allocations:{key:string;label:string;amountCents:number;seatNumber?:number|null}[]=[];
  if(input.mode==="by_guest"){
    for(let seat=1;seat<=Number(check.guest_count||1);seat++){
      const amount=(items||[]).filter((item:any)=>Number(item.seat_number)===seat).reduce((sum:number,item:any)=>sum+Number(item.line_total_cents||0),0);
      allocations.push({key:`guest-${seat}`,label:`Guest ${seat}`,amountCents:amount,seatNumber:seat});
    }
    const shared=(items||[]).filter((item:any)=>item.seat_number==null).reduce((sum:number,item:any)=>sum+Number(item.line_total_cents||0),0);
    if(shared>0&&allocations.length){
      const base=Math.floor(shared/allocations.length);
      let remainder=shared-base*allocations.length;
      allocations=allocations.map(row=>({...row,amountCents:row.amountCents+base+(remainder-->0?1:0)}));
    }
  }else if(input.mode==="even"){
    const parts=Math.max(2,Math.min(99,Number(input.parts||check.guest_count||2)));
    const base=Math.floor(Number(check.total_cents||0)/parts);
    let remainder=Number(check.total_cents||0)-base*parts;
    allocations=Array.from({length:parts},(_,i)=>({key:`part-${i+1}`,label:`Part ${i+1}`,amountCents:base+(remainder-->0?1:0)}));
  }else{
    const entries=Object.entries(input.custom||{}).filter(([,amount])=>Number.isInteger(amount)&&amount>=0);
    allocations=entries.map(([key,amount],i)=>({key,label:key||`Custom ${i+1}`,amountCents:Number(amount)}));
    const sum=allocations.reduce((total,row)=>total+row.amountCents,0);
    if(sum!==Number(check.total_cents||0)) throw new Error("pos_signature_custom_split_total_mismatch");
  }
  const currentTotal=allocations.reduce((total,row)=>total+row.amountCents,0);
  const delta=Number(check.total_cents||0)-currentTotal;
  if(allocations.length&&delta!==0) allocations[allocations.length-1].amountCents+=delta;
  const plan={mode:input.mode,allocations,createdAt:now(),totalCents:Number(check.total_cents||0)};
  const {error:updateError}=await shard.client.from("pos_checks").update({
    metadata:{...safeMetadata(check.metadata),signature_plus_split_plan:plan},updated_at:now(),
  }).eq("location_id",input.locationId).eq("id",input.checkId);
  if(updateError) throw new Error(updateError.message||"pos_signature_split_save_failed");
  await notify(input.locationId,"pos_check",input.checkId,{action:"split_plan_updated"});
  return plan;
}

export async function createSignaturePlusSplitTender(input:{locationId:string;checkId:string;allocationKey:string;tipCents?:number}){
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"read"});
  const {data:check,error}=await shard.client.from("pos_checks").select("id,metadata").eq("location_id",input.locationId).eq("id",input.checkId).maybeSingle();
  if(error||!check) throw new Error(error?.message||"pos_signature_check_not_found");
  const plan=safeMetadata(check.metadata).signature_plus_split_plan;
  const allocations=Array.isArray(plan?.allocations)?plan.allocations:[];
  const allocation=allocations.find((row:any)=>String(row?.key||"")===String(input.allocationKey||""));
  if(!allocation) throw new Error("pos_signature_split_allocation_not_found");
  const amountCents=Number(allocation.amountCents||0);
  if(!Number.isInteger(amountCents)||amountCents<=0) throw new Error("invalid_pos_partial_amount");
  const {data:location, error:locationError}=await supabaseAdmin.from("locations").select("*").eq("id",input.locationId).maybeSingle();
  if(locationError||!location) throw new Error(locationError?.message||"pos_location_not_found");
  const result=await createCheckCardPayment({location,checkId:input.checkId,amountCents,tipCents:input.tipCents||0});
  await notify(input.locationId,"pos_check",input.checkId,{action:"split_tender_created",allocationKey:input.allocationKey,tenderId:result.tender_id});
  return {...result,allocationKey:input.allocationKey};
}

export async function getSignaturePlusInventory(locationId:string){
  const catalog=await getUniversalLocationCatalog(locationId,{channel:"pos",includeUnavailable:true});
  const ingredients=catalog.items.filter((item:any)=>item.metadata?.inventory_role==="ingredient");
  const availability=await getPosInventoryAvailability(locationId,ingredients.map((item:any)=>item.id));
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const [
    {data:itemRows,error:itemError},
    {data:areas,error:areaError},
    {data:balances,error:balanceError},
    {data:adjustments,error:adjustmentError},
    {data:transfers,error:transferError},
  ]=await Promise.all([
    shard.client.from("pos_inventory_items")
      .select("id,catalog_item_id,quantity_on_hand,unit_code,reorder_point,reorder_quantity,preferred_vendor,vendor_sku,updated_at")
      .eq("location_id",locationId),
    shard.client.from("pos_inventory_stock_areas")
      .select("id,code,name,is_active,created_at,updated_at")
      .eq("location_id",locationId).eq("is_active",true).order("name",{ascending:true}),
    shard.client.from("pos_inventory_area_balances")
      .select("inventory_item_id,stock_area_id,quantity,updated_at")
      .eq("location_id",locationId).order("updated_at",{ascending:false}),
    shard.client.from("pos_inventory_adjustments")
      .select("id,inventory_item_id,catalog_item_id,quantity_delta,reason,source_type,source_id,created_at")
      .eq("location_id",locationId).order("created_at",{ascending:false}).limit(50),
    shard.client.from("pos_inventory_transfers")
      .select("id,inventory_item_id,from_stock_area_id,to_stock_area_id,quantity,status,metadata,created_at")
      .eq("location_id",locationId).order("created_at",{ascending:false}).limit(50),
  ]);
  if(itemError) throw new Error(itemError.message||"pos_signature_inventory_items_failed");
  if(areaError) throw new Error(areaError.message||"pos_signature_inventory_areas_failed");
  if(balanceError) throw new Error(balanceError.message||"pos_signature_inventory_balances_failed");
  if(adjustmentError) throw new Error(adjustmentError.message||"pos_signature_inventory_adjustments_failed");
  if(transferError) throw new Error(transferError.message||"pos_signature_inventory_transfers_failed");

  const catalogById=new Map(catalog.items.map((item:any)=>[String(item.id),item]));
  const itemByCatalogId=new Map((itemRows||[]).map((row:any)=>[String(row.catalog_item_id),row]));
  const itemById=new Map((itemRows||[]).map((row:any)=>[String(row.id),row]));
  const areaById=new Map((areas||[]).map((row:any)=>[String(row.id),row]));

  const recipes=catalog.items.flatMap((item:any)=>{
    const components=Array.isArray(item.metadata?.recipe)?item.metadata.recipe:[];
    return components.length?[{
      catalogItemId:item.id,name:item.name,
      components:components.map((component:any)=>({
        catalogItemId:String(component.catalogItemId||component.catalog_item_id||""),
        quantity:Number(component.quantity||component.units||0),
        unit:String(component.unit||"unit"),
      })),
    }]:[];
  });

  const normalizedIngredients=ingredients.map((item:any)=>{
    const stock=availability.get(item.id);
    const inventoryRow=itemByCatalogId.get(String(item.id)) as any;
    const quantityOnHand=stock?.quantityOnHand??0;
    const reorderPoint=stock?.reorderPoint??null;
    return {
      id:String(item.id),
      inventoryItemId:inventoryRow?.id?String(inventoryRow.id):null,
      name:item.name,
      unit:stock?.unitCode||String(item.metadata?.inventory_unit||"unit"),
      quantityOnHand,
      lowStock:stock?.lowStock===true,
      soldOut:stock?.soldOut===true,
      lowStockThreshold:stock?.lowStockThreshold??null,
      reorderPoint,
      reorderQuantity:stock?.reorderQuantity??null,
      preferredVendor:stock?.preferredVendor??null,
      vendorSku:stock?.vendorSku??null,
      reorderNeeded:reorderPoint!=null&&quantityOnHand<=reorderPoint,
    };
  });

  const normalizedAdjustments=(adjustments||[]).map((row:any)=>({
    id:String(row.id),
    inventoryItemId:String(row.inventory_item_id),
    catalogItemId:String(row.catalog_item_id),
    ingredientName:String((catalogById.get(String(row.catalog_item_id)) as any)?.name||"Ingredient"),
    quantityDelta:Number(row.quantity_delta||0),
    reason:String(row.reason||"adjustment"),
    sourceType:String(row.source_type||"manual"),
    sourceId:row.source_id==null?null:String(row.source_id),
    createdAt:row.created_at,
  }));

  return {
    summary:{
      ingredientCount:normalizedIngredients.length,
      lowStockCount:normalizedIngredients.filter((item:any)=>item.lowStock).length,
      reorderCount:normalizedIngredients.filter((item:any)=>item.reorderNeeded).length,
      wasteEvents:normalizedAdjustments.filter((row:any)=>row.sourceType==="waste"||row.reason==="waste").length,
      transferEvents:(transfers||[]).length,
    },
    ingredients:normalizedIngredients,
    recipes,
    stockAreas:(areas||[]).map((row:any)=>({
      id:String(row.id),code:String(row.code),name:String(row.name),updatedAt:row.updated_at,
    })),
    balances:(balances||[]).map((row:any)=>{
      const inventory=itemById.get(String(row.inventory_item_id)) as any;
      const catalogItem=inventory?catalogById.get(String(inventory.catalog_item_id)) as any:null;
      const area=areaById.get(String(row.stock_area_id)) as any;
      return {
        inventoryItemId:String(row.inventory_item_id),
        catalogItemId:inventory?.catalog_item_id?String(inventory.catalog_item_id):null,
        ingredientName:String(catalogItem?.name||"Ingredient"),
        stockAreaId:String(row.stock_area_id),
        stockAreaName:String(area?.name||"Stock Area"),
        quantity:Number(row.quantity||0),
        updatedAt:row.updated_at,
      };
    }),
    recentAdjustments:normalizedAdjustments,
    recentWaste:normalizedAdjustments.filter((row:any)=>row.sourceType==="waste"||row.reason==="waste"),
    recentTransfers:(transfers||[]).map((row:any)=>{
      const inventory=itemById.get(String(row.inventory_item_id)) as any;
      const catalogItem=inventory?catalogById.get(String(inventory.catalog_item_id)) as any:null;
      return {
        id:String(row.id),
        inventoryItemId:String(row.inventory_item_id),
        catalogItemId:inventory?.catalog_item_id?String(inventory.catalog_item_id):null,
        ingredientName:String(catalogItem?.name||"Ingredient"),
        fromStockAreaId:String(row.from_stock_area_id),
        fromStockAreaName:String((areaById.get(String(row.from_stock_area_id)) as any)?.name||"Stock Area"),
        toStockAreaId:String(row.to_stock_area_id),
        toStockAreaName:String((areaById.get(String(row.to_stock_area_id)) as any)?.name||"Stock Area"),
        quantity:Number(row.quantity||0),
        status:String(row.status||"completed"),
        sourceId:row.metadata?.source_id==null?null:String(row.metadata.source_id),
        createdAt:row.created_at,
      };
    }),
  };
}

export async function getSignaturePlusReport(input:{locationId:string;from?:string|null;to?:string|null}){
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"read"});
  const from=input.from&&Number.isFinite(Date.parse(input.from))?new Date(input.from).toISOString():new Date(Date.now()-7*86400000).toISOString();
  const to=input.to&&Number.isFinite(Date.parse(input.to))?new Date(input.to).toISOString():now();
  const [
    {data:checks,error:checkError},
    {data:tenders,error:tenderError},
    {data:items,error:itemError},
    {data:orders,error:orderError},
    {data:staff,error:staffError},
    {data:adjustments,error:adjustmentError},
    {data:transfers,error:transferError},
  ]=await Promise.all([
    shard.client.from("pos_checks")
      .select("id,status,total_cents,discount_cents,tax_cents,tip_cents,amount_refunded_cents,server_staff_profile_id,opened_at,closed_at")
      .eq("location_id",input.locationId).gte("opened_at",from).lte("opened_at",to),
    shard.client.from("pos_tenders")
      .select("id,check_id,tender_type,status,amount_cents,tip_cents,amount_refunded_cents,metadata,created_at")
      .eq("location_id",input.locationId).gte("created_at",from).lte("created_at",to),
    shard.client.from("pos_order_items")
      .select("item_name,quantity,line_total_cents,status,created_at")
      .eq("location_id",input.locationId).gte("created_at",from).lte("created_at",to).neq("status","voided"),
    shard.client.from("pos_orders")
      .select("id,course_name,status,server_staff_profile_id,created_at")
      .eq("location_id",input.locationId).gte("created_at",from).lte("created_at",to),
    shard.client.from("reserve_staff_profiles")
      .select("id,display_name,role").eq("location_id",input.locationId),
    shard.client.from("pos_inventory_adjustments")
      .select("quantity_delta,reason,source_type,created_at")
      .eq("location_id",input.locationId).gte("created_at",from).lte("created_at",to),
    shard.client.from("pos_inventory_transfers")
      .select("quantity,status,created_at")
      .eq("location_id",input.locationId).gte("created_at",from).lte("created_at",to),
  ]);
  if(checkError) throw new Error(checkError.message||"pos_signature_report_checks_failed");
  if(tenderError) throw new Error(tenderError.message||"pos_signature_report_tenders_failed");
  if(itemError) throw new Error(itemError.message||"pos_signature_report_items_failed");
  if(orderError) throw new Error(orderError.message||"pos_signature_report_orders_failed");
  if(staffError) throw new Error(staffError.message||"pos_signature_report_staff_failed");
  if(adjustmentError) throw new Error(adjustmentError.message||"pos_signature_report_inventory_failed");
  if(transferError) throw new Error(transferError.message||"pos_signature_report_transfers_failed");

  const settledStatuses=new Set(["completed","partially_refunded","refunded"]);
  const settledTenders=(tenders||[]).filter((row:any)=>settledStatuses.has(String(row.status||"")));
  const gross=(checks||[]).reduce((s:number,r:any)=>s+Number(r.total_cents||0),0);
  const refunds=(checks||[]).reduce((s:number,r:any)=>s+Number(r.amount_refunded_cents||0),0);
  const tips=settledTenders.reduce((s:number,r:any)=>s+Number(r.tip_cents||0),0);
  const discounts=(checks||[]).reduce((s:number,r:any)=>s+Number(r.discount_cents||0),0);
  const tax=(checks||[]).reduce((s:number,r:any)=>s+Number(r.tax_cents||0),0);
  const paymentMethods=Object.entries(settledTenders.reduce((acc:Record<string,number>,r:any)=>{
    const key=String(r.tender_type||"other");
    acc[key]=(acc[key]||0)+Math.max(0,Number(r.amount_cents||0)-Number(r.amount_refunded_cents||0));
    return acc;
  },{})).map(([type,amountCents])=>({type,amountCents}));
  const topItems=Object.values((items||[]).reduce((acc:Record<string,any>,r:any)=>{
    const key=String(r.item_name||"Item");const row=acc[key]||{name:key,quantity:0,salesCents:0};
    row.quantity+=Number(r.quantity||0);row.salesCents+=Number(r.line_total_cents||0);acc[key]=row;return acc;
  },{})).sort((a:any,b:any)=>b.salesCents-a.salesCents).slice(0,20);

  const staffById=new Map((staff||[]).map((row:any)=>[String(row.id),row]));
  const serverPerformance=Object.values((checks||[]).reduce((acc:Record<string,any>,check:any)=>{
    const key=check.server_staff_profile_id?String(check.server_staff_profile_id):"unassigned";
    const staffRow=staffById.get(key) as any;
    const row=acc[key]||{
      staffProfileId:key==="unassigned"?null:key,
      name:key==="unassigned"?"Unassigned":String(staffRow?.display_name||"Staff"),
      role:key==="unassigned"?"":String(staffRow?.role||"staff"),
      checks:0,
      salesCents:0,
      refundsCents:0,
    };
    row.checks+=1;
    row.salesCents+=Number(check.total_cents||0);
    row.refundsCents+=Number(check.amount_refunded_cents||0);
    acc[key]=row;
    return acc;
  },{})).map((row:any)=>({...row,netSalesCents:Math.max(0,row.salesCents-row.refundsCents)}))
    .sort((a:any,b:any)=>b.netSalesCents-a.netSalesCents);

  const courseMix=Object.values((orders||[]).reduce((acc:Record<string,any>,order:any)=>{
    const key=String(order.course_name||"other");
    const row=acc[key]||{course:key,orders:0,fired:0,fulfilled:0};
    row.orders+=1;
    if(String(order.status)==="fired") row.fired+=1;
    if(String(order.status)==="fulfilled") row.fulfilled+=1;
    acc[key]=row;
    return acc;
  },{})).sort((a:any,b:any)=>b.orders-a.orders);

  const recipeUsage=(adjustments||[]).filter((row:any)=>String(row.reason)==="recipe_usage"||String(row.source_type)==="signature_plus_recipe");
  const waste=(adjustments||[]).filter((row:any)=>String(row.source_type)==="waste"||String(row.reason)==="waste");
  const completedTransfers=(transfers||[]).filter((row:any)=>String(row.status||"completed")==="completed");

  return {
    from,to,
    metrics:{
      grossSalesCents:gross,
      netSalesCents:Math.max(0,gross-refunds),
      refundsCents:refunds,
      tipsCents:tips,
      discountsCents:discounts,
      taxCents:tax,
      checks:(checks||[]).length,
      closedChecks:(checks||[]).filter((row:any)=>String(row.status)==="closed").length,
      openChecks:(checks||[]).filter((row:any)=>["open","held"].includes(String(row.status))).length,
      averageCheckCents:(checks||[]).length?Math.round(gross/(checks||[]).length):0,
      splitTenderCount:settledTenders.filter((row:any)=>row.metadata?.partial_tender===true).length,
    },
    inventoryMetrics:{
      recipeUsageQuantity:Number(recipeUsage.reduce((sum:number,row:any)=>sum+Math.abs(Number(row.quantity_delta||0)),0).toFixed(4)),
      wasteQuantity:Number(waste.reduce((sum:number,row:any)=>sum+Math.abs(Number(row.quantity_delta||0)),0).toFixed(4)),
      wasteEvents:waste.length,
      transferQuantity:Number(completedTransfers.reduce((sum:number,row:any)=>sum+Number(row.quantity||0),0).toFixed(4)),
      transferEvents:completedTransfers.length,
    },
    paymentMethods,topItems,serverPerformance,courseMix,
  };
}


export async function getSignaturePlusOperations(locationId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const [{data:checks,error:checkError},{data:tables,error:tableError},{data:staff,error:staffError}]=await Promise.all([
    shard.client.from("pos_checks")
      .select("id,guest_count,subtotal_cents,discount_cents,tax_cents,service_charge_cents,total_cents,amount_paid_cents,amount_refunded_cents,tip_cents,server_staff_profile_id,opened_at,status")
      .eq("location_id",locationId).in("status",["open","held"]).order("opened_at",{ascending:true}),
    shard.client.from("layout_items")
      .select("id,item_name,item_number,item_type,capacity,status,is_active,sort_order")
      .eq("location_id",locationId).eq("is_active",true).order("sort_order",{ascending:true}),
    shard.client.from("reserve_staff_profiles")
      .select("id,display_name,role,is_active").eq("location_id",locationId).eq("is_active",true).order("display_name",{ascending:true}),
  ]);
  if(checkError) throw new Error(checkError.message||"pos_signature_operations_checks_failed");
  if(tableError) throw new Error(tableError.message||"pos_signature_operations_tables_failed");
  if(staffError) throw new Error(staffError.message||"pos_signature_operations_staff_failed");
  const checkIds=(checks||[]).map((row:any)=>String(row.id));
  const [
    {data:resources,error:resourceError},
    {data:items,error:itemError},
    {data:tenders,error:tenderError},
  ]=checkIds.length
    ? await Promise.all([
        shard.client.from("pos_check_resources")
          .select("check_id,layout_item_id,resource_label").eq("location_id",locationId).in("check_id",checkIds),
        shard.client.from("pos_order_items")
          .select("id,check_id,item_name,seat_number,quantity,line_total_cents,status,void_reason,created_at")
          .eq("location_id",locationId).in("check_id",checkIds).order("created_at",{ascending:true}),
        shard.client.from("pos_tenders")
          .select("id,check_id,tender_number,tender_type,status,amount_cents,tip_cents,amount_refunded_cents,cash_received_cents,cash_change_cents,created_at")
          .eq("location_id",locationId).in("check_id",checkIds).order("tender_number",{ascending:true}),
      ])
    : [
        {data:[],error:null},
        {data:[],error:null},
        {data:[],error:null},
      ];
  if(resourceError) throw new Error(resourceError.message||"pos_signature_operations_resources_failed");
  if(itemError) throw new Error(itemError.message||"pos_signature_operations_items_failed");
  if(tenderError) throw new Error(tenderError.message||"pos_signature_operations_tenders_failed");
  const staffById=new Map((staff||[]).map((row:any)=>[String(row.id),row]));
  return {
    openChecks:(checks||[]).map((check:any)=>({
      id:String(check.id),
      guestCount:Number(check.guest_count||1),
      subtotalCents:Number(check.subtotal_cents||0),
      discountCents:Number(check.discount_cents||0),
      taxCents:Number(check.tax_cents||0),
      serviceChargeCents:Number(check.service_charge_cents||0),
      totalCents:Number(check.total_cents||0),
      amountPaidCents:Number(check.amount_paid_cents||0),
      amountRefundedCents:Number(check.amount_refunded_cents||0),
      tipCents:Number(check.tip_cents||0),
      remainingCents:Math.max(0,Number(check.total_cents||0)-Number(check.amount_paid_cents||0)+Number(check.amount_refunded_cents||0)),
      items:(items||[]).filter((row:any)=>String(row.check_id)===String(check.id)).map((row:any)=>({
        id:String(row.id),name:String(row.item_name||"Item"),seatNumber:row.seat_number==null?null:Number(row.seat_number),
        quantity:Number(row.quantity||1),lineTotalCents:Number(row.line_total_cents||0),status:String(row.status||"active"),
        voidReason:row.void_reason||null,createdAt:row.created_at,
      })),
      tenders:(tenders||[]).filter((row:any)=>String(row.check_id)===String(check.id)).map((row:any)=>({
        id:String(row.id),number:Number(row.tender_number||0),type:String(row.tender_type||"other"),status:String(row.status||""),
        amountCents:Number(row.amount_cents||0),tipCents:Number(row.tip_cents||0),amountRefundedCents:Number(row.amount_refunded_cents||0),
        refundableCents:Math.max(0,Number(row.amount_cents||0)-Number(row.amount_refunded_cents||0)),
        cashReceivedCents:row.cash_received_cents==null?null:Number(row.cash_received_cents),
        cashChangeCents:row.cash_change_cents==null?null:Number(row.cash_change_cents),createdAt:row.created_at,
      })),
      openedAt:check.opened_at,
      tables:(resources||[]).filter((row:any)=>String(row.check_id)===String(check.id)).map((row:any)=>({
        id:row.layout_item_id?String(row.layout_item_id):null,label:String(row.resource_label||"Table"),
      })),
      server:check.server_staff_profile_id?{
        id:String(check.server_staff_profile_id),
        name:String(staffById.get(String(check.server_staff_profile_id))?.display_name||"Staff"),
      }:null,
    })),
    tables:(tables||[]).filter((row:any)=>{
      const type=String(row.item_type||"").toLowerCase();
      return type.includes("table")||type.includes("booth")||type.includes("bar");
    }).map((row:any)=>({
      id:String(row.id),label:String(row.item_name||row.item_number||"Table"),capacity:Number(row.capacity||1),status:String(row.status||"available"),
    })),
    staff:(staff||[]).map((row:any)=>({
      id:String(row.id),name:String(row.display_name||"Staff"),role:String(row.role||"staff"),
    })),
  };
}

export async function getSignaturePlusBootstrap(locationId:string){
  const [kds,operations,inventory,report]=await Promise.all([
    listSignaturePlusKds({locationId}),
    getSignaturePlusOperations(locationId),
    getSignaturePlusInventory(locationId),
    getSignaturePlusReport({locationId}),
  ]);
  return {kds,operations,inventory,report};
}
