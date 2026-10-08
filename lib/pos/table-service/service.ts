import "server-only";

import { getUniversalLocationCatalog } from "@/lib/catalog/universalCatalog";
import { getPosInventoryAvailability } from "@/lib/pos/inventory/service";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

const ACTIVE_RESERVATION_STATUSES=["pending","confirmed","checked_in","arrived","seated","occupied"];

type CourseName="drinks"|"appetizers"|"entrees"|"desserts"|"other";

function required(value:unknown,field:string){
  const text=String(value??"").trim();
  if(!text) throw new Error(`pos_table_missing_${field}`);
  return text;
}
function cleanCourse(value:unknown):CourseName{
  const raw=String(value||"").trim().toLowerCase();
  if(["drink","drinks","beverage","beverages","bar"].includes(raw)) return "drinks";
  if(["app","apps","appetizer","appetizers","starter","starters"].includes(raw)) return "appetizers";
  if(["entree","entrees","entrée","entrées","main","mains"].includes(raw)) return "entrees";
  if(["dessert","desserts","sweet","sweets"].includes(raw)) return "desserts";
  return "other";
}
function inferCourse(item:any,sectionTitle?:string|null):CourseName{
  const metadata=item?.metadata&&typeof item.metadata==="object"?item.metadata:{};
  const explicit=metadata.course_name||metadata.course||metadata.meal_course;
  if(explicit) return cleanCourse(explicit);
  return cleanCourse(sectionTitle||"other");
}
function moneyFields(check:any){
  return {
    subtotalCents:Number(check?.subtotal_cents||0),
    discountCents:Number(check?.discount_cents||0),
    taxCents:Number(check?.tax_cents||0),
    serviceChargeCents:Number(check?.service_charge_cents||0),
    totalCents:Number(check?.total_cents||0),
    amountPaidCents:Number(check?.amount_paid_cents||0),
    amountRefundedCents:Number(check?.amount_refunded_cents||0),
    remainingCents:Math.max(0,Number(check?.total_cents||0)-Number(check?.amount_paid_cents||0)+Number(check?.amount_refunded_cents||0)),
    tipCents:Number(check?.tip_cents||0),
  };
}
async function getCatalog(locationId:string){
  const catalog=await getUniversalLocationCatalog(locationId,{channel:"pos",includeUnavailable:true});
  const sectionById=new Map((catalog.sections||[]).map((s:any)=>[String(s.id),String(s.title||s.name||"")]));
  const availability=await getPosInventoryAvailability(locationId,catalog.items.map((item:any)=>item.id));
  return {
    page:catalog.page,
    sections:(catalog.sections||[]).map((section:any)=>({
      id:String(section.id),
      name:String(section.title||section.name||"Menu"),
      sortOrder:Number(section.sort_order||0),
    })),
    items:catalog.items.map((item:any)=>{
      const stock=availability.get(item.id);
      return {
        id:item.id,
        sectionId:item.sectionId,
        name:item.posShortName||item.name,
        fullName:item.name,
        description:item.description,
        imageUrl:item.imageUrl,
        priceCents:Number(item.basePriceCents||0),
        isAvailable:item.isAvailable!==false&&stock?.soldOut!==true,
        lowStock:stock?.lowStock===true,
        course:inferCourse(item,sectionById.get(String(item.sectionId||""))||null),
        modifiers:item.modifiers.map((group:any)=>({
          id:group.id,
          name:group.name,
          minSelect:group.minSelect,
          maxSelect:group.maxSelect,
          required:group.isRequired,
          modifiers:group.modifiers.filter((m:any)=>m.isAvailable).map((m:any)=>({
            id:m.id,name:m.name,priceDeltaCents:Number(m.priceDeltaCents||0),
          })),
        })),
      };
    }),
  };
}
function pickReservation(rows:any[]){
  if(!rows.length) return null;
  const now=Date.now();
  return [...rows].sort((a,b)=>{
    const at=Date.parse(`${a.reservation_date}T${String(a.reservation_time||"00:00").slice(0,5)}:00`);
    const bt=Date.parse(`${b.reservation_date}T${String(b.reservation_time||"00:00").slice(0,5)}:00`);
    return Math.abs(at-now)-Math.abs(bt-now);
  })[0];
}

export async function listPosTableServiceTables(locationId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:tables,error}=await shard.client.from("layout_items")
    .select("id,item_type,item_name,item_number,capacity,status,is_active,sort_order")
    .eq("location_id",locationId).eq("is_active",true)
    .order("sort_order",{ascending:true});
  if(error) throw new Error(error.message||"pos_table_layout_failed");

  const tableRows=(tables||[]).filter((row:any)=>{
    const type=String(row.item_type||"").toLowerCase();
    return type.includes("table")||type.includes("booth")||type.includes("bar");
  });
  const tableIds=tableRows.map((row:any)=>String(row.id));
  const {data:seats,error:seatError}=tableIds.length
    ? await shard.client.from("reservation_seating_resources")
        .select("id,parent_layout_item_id,label,seat_index,capacity")
        .eq("location_id",locationId).in("parent_layout_item_id",tableIds).eq("is_active",true)
    : {data:[],error:null};
  if(seatError) throw new Error(seatError.message||"pos_table_seats_failed");
  const seatIds=(seats||[]).map((row:any)=>String(row.id));
  const {data:assignments,error:assignmentError}=seatIds.length
    ? await shard.client.from("reservation_resource_assignments")
        .select("reservation_id,seating_resource_id")
        .eq("location_id",locationId).in("seating_resource_id",seatIds)
    : {data:[],error:null};
  if(assignmentError) throw new Error(assignmentError.message||"pos_table_assignments_failed");
  const reservationIds=Array.from(new Set((assignments||[]).map((row:any)=>String(row.reservation_id))));
  const {data:reservations,error:reservationError}=reservationIds.length
    ? await shard.client.from("location_reservations")
        .select("id,customer_name,customer_phone,reservation_date,reservation_time,party_size,status")
        .eq("location_id",locationId).in("id",reservationIds).in("status",ACTIVE_RESERVATION_STATUSES)
    : {data:[],error:null};
  if(reservationError) throw new Error(reservationError.message||"pos_table_reservations_failed");

  const seatById=new Map((seats||[]).map((row:any)=>[String(row.id),row]));
  const reservationById=new Map((reservations||[]).map((row:any)=>[String(row.id),row]));
  const {data:resources,error:resourceError}=await shard.client.from("pos_check_resources")
    .select("check_id,layout_item_id")
    .eq("location_id",locationId).in("layout_item_id",tableIds.length?tableIds:["00000000-0000-0000-0000-000000000000"]);
  if(resourceError) throw new Error(resourceError.message||"pos_table_check_resources_failed");
  const checkIds=Array.from(new Set((resources||[]).map((r:any)=>String(r.check_id))));
  const {data:checks,error:checkError}=checkIds.length
    ? await shard.client.from("pos_checks")
        .select("id,status,guest_count,total_cents,opened_at")
        .eq("location_id",locationId).in("id",checkIds).in("status",["open","held"])
    : {data:[],error:null};
  if(checkError) throw new Error(checkError.message||"pos_table_checks_failed");
  const checkById=new Map((checks||[]).map((row:any)=>[String(row.id),row]));

  return tableRows.map((table:any)=>{
    const tableSeatIds=(seats||[]).filter((seat:any)=>String(seat.parent_layout_item_id)===String(table.id)).map((seat:any)=>String(seat.id));
    const possible=(assignments||[])
      .filter((a:any)=>tableSeatIds.includes(String(a.seating_resource_id)))
      .map((a:any)=>reservationById.get(String(a.reservation_id))).filter(Boolean);
    const reservation=pickReservation(possible as any[]);
    const resource=(resources||[]).find((r:any)=>String(r.layout_item_id)===String(table.id)&&checkById.has(String(r.check_id)));
    const check=resource?checkById.get(String(resource.check_id)):null;
    return {
      id:String(table.id),
      label:String(table.item_name||table.item_number||"Table"),
      number:table.item_number==null?null:String(table.item_number),
      capacity:Number(table.capacity||tableSeatIds.length||1),
      status:String(table.status||"available"),
      reservation:reservation?{
        id:String(reservation.id),
        customerName:String(reservation.customer_name||"Guest"),
        customerPhone:reservation.customer_phone||null,
        date:String(reservation.reservation_date||""),
        time:String(reservation.reservation_time||"").slice(0,5),
        partySize:Number(reservation.party_size||1),
        status:String(reservation.status||"confirmed"),
      }:null,
      openCheck:check?{
        id:String(check.id),
        guestCount:Number(check.guest_count||1),
        totalCents:Number(check.total_cents||0),
        openedAt:check.opened_at,
      }:null,
    };
  });
}

async function resolveReservationForTable(locationId:string,layoutItemId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:seats,error}=await shard.client.from("reservation_seating_resources")
    .select("id").eq("location_id",locationId).eq("parent_layout_item_id",layoutItemId).eq("is_active",true);
  if(error) throw new Error(error.message||"pos_table_seats_failed");
  const seatIds=(seats||[]).map((row:any)=>String(row.id));
  if(!seatIds.length) return null;
  const {data:assignments,error:assignmentError}=await shard.client.from("reservation_resource_assignments")
    .select("reservation_id").eq("location_id",locationId).in("seating_resource_id",seatIds);
  if(assignmentError) throw new Error(assignmentError.message||"pos_table_assignments_failed");
  const ids=Array.from(new Set((assignments||[]).map((row:any)=>String(row.reservation_id))));
  if(!ids.length) return null;
  const {data,error:reservationError}=await shard.client.from("location_reservations")
    .select("id,customer_name,customer_phone,reservation_date,reservation_time,party_size,status")
    .eq("location_id",locationId).in("id",ids).in("status",ACTIVE_RESERVATION_STATUSES);
  if(reservationError) throw new Error(reservationError.message||"pos_table_reservations_failed");
  return pickReservation(data||[]);
}

export async function getPosTableCheckWorkspace(locationId:string,checkId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:check,error}=await shard.client.from("pos_checks")
    .select("*").eq("location_id",locationId).eq("id",checkId).maybeSingle();
  if(error) throw new Error(error.message||"pos_table_check_failed");
  if(!check) throw new Error("pos_table_check_not_found");
  const [{data:resources,error:resourceError},{data:orders,error:ordersError},{data:tenders,error:tenderError}]=await Promise.all([
    shard.client.from("pos_check_resources").select("layout_item_id,resource_label").eq("location_id",locationId).eq("check_id",checkId),
    shard.client.from("pos_orders").select("id,status,course_name,sent_at,created_at").eq("location_id",locationId).eq("check_id",checkId).order("created_at",{ascending:true}),
    shard.client.from("pos_tenders").select("id,tender_number,tender_type,status,amount_cents,tip_cents,amount_refunded_cents,cash_received_cents,cash_change_cents,created_at").eq("location_id",locationId).eq("check_id",checkId).order("tender_number",{ascending:true}),
  ]);
  if(resourceError) throw new Error(resourceError.message||"pos_table_resource_failed");
  if(ordersError) throw new Error(ordersError.message||"pos_table_orders_failed");
  if(tenderError) throw new Error(tenderError.message||"pos_table_tenders_failed");
  const orderIds=(orders||[]).map((row:any)=>String(row.id));
  const {data:items,error:itemError}=orderIds.length
    ? await shard.client.from("pos_order_items")
        .select("id,order_id,catalog_item_id,item_name,seat_number,quantity,unit_price_cents,unit_modifier_total_cents,line_total_cents,modifiers,notes,status,created_at")
        .eq("location_id",locationId).eq("check_id",checkId).order("created_at",{ascending:true})
    : {data:[],error:null};
  if(itemError) throw new Error(itemError.message||"pos_table_items_failed");
  let reservation:any=null;
  if(check.reservation_id){
    const {data}=await shard.client.from("location_reservations")
      .select("id,customer_name,customer_phone,reservation_date,reservation_time,party_size,status")
      .eq("id",check.reservation_id).eq("location_id",locationId).maybeSingle();
    reservation=data;
  }
  const courseByOrder=new Map((orders||[]).map((row:any)=>[String(row.id),cleanCourse(row.course_name)]));
  return {
    id:String(check.id),
    status:String(check.status),
    guestCount:Number(check.guest_count||1),
    reservation:reservation?{
      id:String(reservation.id),
      customerName:String(reservation.customer_name||"Guest"),
      customerPhone:reservation.customer_phone||null,
      date:String(reservation.reservation_date||""),
      time:String(reservation.reservation_time||"").slice(0,5),
      partySize:Number(reservation.party_size||check.guest_count||1),
      status:String(reservation.status||""),
    }:null,
    resources:resources||[],
    amounts:moneyFields(check),
    tenders:(tenders||[]).map((row:any)=>({
      id:String(row.id),number:Number(row.tender_number||0),type:String(row.tender_type||"other"),status:String(row.status||""),
      amountCents:Number(row.amount_cents||0),tipCents:Number(row.tip_cents||0),amountRefundedCents:Number(row.amount_refunded_cents||0),
      refundableCents:Math.max(0,Number(row.amount_cents||0)-Number(row.amount_refunded_cents||0)),
      cashReceivedCents:row.cash_received_cents==null?null:Number(row.cash_received_cents),
      cashChangeCents:row.cash_change_cents==null?null:Number(row.cash_change_cents),
    })),
    items:(items||[]).map((item:any)=>({
      id:String(item.id),
      orderId:String(item.order_id),
      catalogItemId:item.catalog_item_id?String(item.catalog_item_id):null,
      name:String(item.item_name||"Item"),
      seatNumber:item.seat_number==null?null:Number(item.seat_number),
      shared:item.seat_number==null,
      course:courseByOrder.get(String(item.order_id))||"other",
      quantity:Number(item.quantity||1),
      unitPriceCents:Number(item.unit_price_cents||0),
      modifierTotalCents:Number(item.unit_modifier_total_cents||0),
      lineTotalCents:Number(item.line_total_cents||0),
      modifiers:Array.isArray(item.modifiers)?item.modifiers:[],
      notes:item.notes||null,
      status:String(item.status||"active"),
    })),
  };
}

export async function openOrResumePosTableCheck(input:{
  locationId:string; layoutItemId:string; guestCount?:number|null;
}){
  const locationId=required(input.locationId,"location_id");
  const layoutItemId=required(input.layoutItemId,"layout_item_id");
  const read=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:resourceRows,error:resourceError}=await read.client.from("pos_check_resources")
    .select("check_id").eq("location_id",locationId).eq("layout_item_id",layoutItemId);
  if(resourceError) throw new Error(resourceError.message||"pos_table_resource_failed");
  const ids=(resourceRows||[]).map((r:any)=>String(r.check_id));
  if(ids.length){
    const {data:existing,error}=await read.client.from("pos_checks")
      .select("id").eq("location_id",locationId).in("id",ids).in("status",["open","held"])
      .order("opened_at",{ascending:false}).limit(1).maybeSingle();
    if(error) throw new Error(error.message||"pos_table_check_lookup_failed");
    if(existing?.id) return getPosTableCheckWorkspace(locationId,String(existing.id));
  }
  const reservation=await resolveReservationForTable(locationId,layoutItemId);
  const requested=Number(input.guestCount||0);
  const guestCount=Math.max(1,Math.min(99,Number(reservation?.party_size||requested||1)));
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
  const {data:check,error}=await shard.client.from("pos_checks").insert({
    location_id:locationId,
    reservation_id:reservation?.id||null,
    status:"open",
    guest_count:guestCount,
    currency:"usd",
    subtotal_cents:0,discount_cents:0,tax_cents:0,service_charge_cents:0,total_cents:0,
    metadata:{source:"table_service",reservation_guest_count:reservation?.party_size||null},
  }).select("id").single();
  if(error) throw new Error(error.message||"pos_table_check_create_failed");
  const {data:table}=await shard.client.from("layout_items")
    .select("item_name,item_number").eq("location_id",locationId).eq("id",layoutItemId).maybeSingle();
  const {error:linkError}=await shard.client.from("pos_check_resources").insert({
    check_id:check.id,location_id:locationId,layout_item_id:layoutItemId,
    resource_label:String(table?.item_name||table?.item_number||"Table"),
  });
  if(linkError) throw new Error(linkError.message||"pos_table_check_link_failed");
  return getPosTableCheckWorkspace(locationId,String(check.id));
}

async function recalculateCheck(locationId:string,checkId:string){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
  const {data:items,error}=await shard.client.from("pos_order_items")
    .select("line_total_cents").eq("location_id",locationId).eq("check_id",checkId).neq("status","voided");
  if(error) throw new Error(error.message||"pos_table_retotal_items_failed");
  const subtotal=(items||[]).reduce((sum:number,row:any)=>sum+Number(row.line_total_cents||0),0);
  const {data:check,error:checkError}=await shard.client.from("pos_checks")
    .select("discount_cents,tax_cents,service_charge_cents").eq("location_id",locationId).eq("id",checkId).maybeSingle();
  if(checkError||!check) throw new Error(checkError?.message||"pos_table_check_not_found");
  const total=Math.max(0,subtotal-Number(check.discount_cents||0)+Number(check.tax_cents||0)+Number(check.service_charge_cents||0));
  const {error:updateError}=await shard.client.from("pos_checks")
    .update({subtotal_cents:subtotal,total_cents:total,updated_at:new Date().toISOString()})
    .eq("location_id",locationId).eq("id",checkId);
  if(updateError) throw new Error(updateError.message||"pos_table_retotal_failed");
}

export async function updatePosTableGuestCount(input:{locationId:string;checkId:string;guestCount:number}){
  const count=Math.max(1,Math.min(99,Number(input.guestCount||1)));
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {error}=await shard.client.from("pos_checks").update({
    guest_count:count,
    metadata:{guest_count_override:true},
    updated_at:new Date().toISOString(),
  }).eq("location_id",input.locationId).eq("id",input.checkId).in("status",["open","held"]);
  if(error) throw new Error(error.message||"pos_table_guest_count_failed");
  return getPosTableCheckWorkspace(input.locationId,input.checkId);
}

export async function addPosTableItem(input:{
  locationId:string; checkId:string; catalogItemId:string; seatNumbers?:number[]|null;
  course?:string|null; quantity?:number; modifierIds?:string[]; notes?:string|null;
}){
  const catalog=await getUniversalLocationCatalog(input.locationId,{channel:"pos"});
  const item=catalog.items.find((candidate:any)=>String(candidate.id)===String(input.catalogItemId));
  if(!item||item.isAvailable===false) throw new Error("pos_table_item_unavailable");
  const stock=await getPosInventoryAvailability(input.locationId,[String(item.id)]);
  if(stock.get(String(item.id))?.soldOut) throw new Error("pos_table_item_sold_out");
  const selectedIds=new Set((input.modifierIds||[]).map(String));
  const modifiers:any[]=[];
  for(const group of item.modifiers){
    const available=new Map(group.modifiers.filter((m:any)=>m.isAvailable).map((m:any)=>[String(m.id),m]));
    const selected=[...selectedIds].filter(id=>available.has(id)).map(id=>available.get(id));
    if(selected.length<Number(group.minSelect||0)||(group.maxSelect!=null&&selected.length>Number(group.maxSelect))){
      throw new Error("pos_table_modifier_selection_invalid");
    }
    for(const modifier of selected){
      selectedIds.delete(String(modifier.id));
      modifiers.push({id:String(modifier.id),name:String(modifier.name),price_delta_cents:Number(modifier.priceDeltaCents||0)});
    }
  }
  if(selectedIds.size) throw new Error("pos_table_unknown_modifier");
  const read=await resolveOperationalShardForLocationId(input.locationId,{mode:"read"});
  const {data:check,error:checkError}=await read.client.from("pos_checks")
    .select("id,guest_count,status").eq("location_id",input.locationId).eq("id",input.checkId).maybeSingle();
  if(checkError||!check) throw new Error(checkError?.message||"pos_table_check_not_found");
  if(!["open","held"].includes(String(check.status))) throw new Error("pos_table_check_not_open");
  const seats=(input.seatNumbers||[]).length?Array.from(new Set(input.seatNumbers||[])):[null];
  for(const seat of seats){
    if(seat!==null&&(!Number.isInteger(seat)||seat<1||seat>Number(check.guest_count))) throw new Error("pos_table_invalid_guest");
  }
  const sectionTitle=String((catalog.sections||[]).find((s:any)=>String(s.id)===String(item.sectionId||""))?.title||"");
  const course=cleanCourse(input.course||inferCourse(item,sectionTitle));
  const quantity=Math.max(1,Math.min(99,Number(input.quantity||1)));
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const {data:orders,error:orderLookupError}=await shard.client.from("pos_orders")
    .select("id").eq("location_id",input.locationId).eq("check_id",input.checkId)
    .eq("status","draft").eq("course_name",course).order("created_at",{ascending:true}).limit(1);
  if(orderLookupError) throw new Error(orderLookupError.message||"pos_table_order_lookup_failed");
  let orderId=orders?.[0]?.id?String(orders[0].id):"";
  if(!orderId){
    const {data:created,error}=await shard.client.from("pos_orders").insert({
      location_id:input.locationId,check_id:input.checkId,status:"draft",course_name:course,
      metadata:{source:"table_service"},
    }).select("id").single();
    if(error) throw new Error(error.message||"pos_table_order_create_failed");
    orderId=String(created.id);
  }
  const modifierTotal=modifiers.reduce((sum,m)=>sum+Number(m.price_delta_cents||0),0);
  const rows=seats.map(seat=>({
    location_id:input.locationId,order_id:orderId,check_id:input.checkId,catalog_item_id:item.id,
    item_name:item.posShortName||item.name,seat_number:seat,quantity,
    unit_price_cents:Number(item.basePriceCents||0),unit_modifier_total_cents:modifierTotal,
    discount_cents:0,modifiers,notes:String(input.notes||"").trim().slice(0,500)||null,status:"active",
  }));
  const {error:insertError}=await shard.client.from("pos_order_items").insert(rows);
  if(insertError) throw new Error(insertError.message||"pos_table_item_add_failed");
  await recalculateCheck(input.locationId,input.checkId);
  return getPosTableCheckWorkspace(input.locationId,input.checkId);
}

export async function sendPosTableCourses(input:{
  locationId:string;checkId:string;courses?:string[]|null;
}){
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
  const requested=(input.courses||[]).map(cleanCourse);
  let query=shard.client.from("pos_orders").select("id,course_name")
    .eq("location_id",input.locationId).eq("check_id",input.checkId).eq("status","draft");
  if(requested.length) query=query.in("course_name",requested);
  const {data:orders,error}=await query;
  if(error) throw new Error(error.message||"pos_table_send_lookup_failed");
  const ids=(orders||[]).map((row:any)=>String(row.id));
  if(!ids.length) return getPosTableCheckWorkspace(input.locationId,input.checkId);
  const now=new Date().toISOString();
  const {error:itemError}=await shard.client.from("pos_order_items")
    .update({status:"sent",updated_at:now}).eq("location_id",input.locationId).in("order_id",ids).eq("status","active");
  if(itemError) throw new Error(itemError.message||"pos_table_send_items_failed");
  const {error:orderError}=await shard.client.from("pos_orders")
    .update({status:"sent",sent_at:now,updated_at:now}).eq("location_id",input.locationId).in("id",ids).eq("status","draft");
  if(orderError) throw new Error(orderError.message||"pos_table_send_orders_failed");
  return getPosTableCheckWorkspace(input.locationId,input.checkId);
}

export async function getPosTableServiceBootstrap(locationId:string){
  const [tables,catalog]=await Promise.all([listPosTableServiceTables(locationId),getCatalog(locationId)]);
  return {tables,catalog};
}
