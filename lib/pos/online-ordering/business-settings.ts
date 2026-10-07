import "server-only";

import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

export type BusinessOnlineOrderingSettings = {
  acceptingOrders:boolean;
  autoAccept:boolean;
  autoPrint:boolean;
  defaultPrepMinutes:number;
  prepDelayMinutes:number;
  pausedUntil:string|null;
  timezone:string;
  slotMinutes:number;
  maxOrdersPerSlot:number|null;
  cutoffMinutesBeforeClose:number;
  maxAdvanceDays:number;
  orderingHours:Record<string,[string,string][]>;
  pickupInstructions:string;
  notifications:{
    pos:boolean;
    push:boolean;
    email:boolean;
    sms:boolean;
  };
};

const DEFAULTS:BusinessOnlineOrderingSettings={
  acceptingOrders:true,
  autoAccept:true,
  autoPrint:true,
  defaultPrepMinutes:25,
  prepDelayMinutes:0,
  pausedUntil:null,
  timezone:"America/New_York",
  slotMinutes:15,
  maxOrdersPerSlot:null,
  cutoffMinutesBeforeClose:15,
  maxAdvanceDays:7,
  orderingHours:{},
  pickupInstructions:"",
  notifications:{pos:true,push:true,email:false,sms:false},
};

function bool(value:unknown,fallback:boolean){
  return typeof value==="boolean"?value:fallback;
}
function int(value:unknown,min:number,max:number,fallback:number){
  const n=Number(value);
  return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;
}
function cleanHours(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value)) return {};
  const out:Record<string,[string,string][]>= {};
  for(const day of ["mon","tue","wed","thu","fri","sat","sun"]){
    const raw=(value as Record<string,unknown>)[day];
    if(!Array.isArray(raw)) continue;
    const windows=raw.flatMap((entry)=>{
      if(!Array.isArray(entry)||entry.length<2) return [];
      const open=String(entry[0]||"").trim();
      const close=String(entry[1]||"").trim();
      if(!/^\d{2}:\d{2}$/.test(open)||!/^\d{2}:\d{2}$/.test(close)) return [];
      return [[open,close] as [string,string]];
    });
    if(windows.length) out[day]=windows;
  }
  return out;
}

export async function getBusinessOnlineOrderingSettings(locationId:string):Promise<BusinessOnlineOrderingSettings>{
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data,error}=await shard.client
    .from("pos_ordering_settings")
    .select("*")
    .eq("location_id",locationId)
    .maybeSingle();
  if(error) throw new Error(error.message||"online_order_settings_read_failed");
  if(!data) return DEFAULTS;
  const notifications=(data.notification_settings&&typeof data.notification_settings==="object")
    ? data.notification_settings as Record<string,unknown>
    : {};
  return {
    acceptingOrders:bool(data.accepting_orders,true),
    autoAccept:bool(data.auto_accept,true),
    autoPrint:bool(data.auto_print,true),
    defaultPrepMinutes:int(data.default_prep_minutes,1,240,25),
    prepDelayMinutes:int(data.prep_delay_minutes,0,240,0),
    pausedUntil:typeof data.paused_until==="string"?data.paused_until:null,
    timezone:String(data.timezone||"America/New_York"),
    slotMinutes:int(data.slot_minutes,5,120,15),
    maxOrdersPerSlot:data.max_orders_per_slot==null?null:int(data.max_orders_per_slot,1,1000,20),
    cutoffMinutesBeforeClose:int(data.cutoff_minutes_before_close,0,240,15),
    maxAdvanceDays:int(data.max_advance_days,0,90,7),
    orderingHours:cleanHours(data.ordering_hours),
    pickupInstructions:String(data.pickup_instructions||""),
    notifications:{
      pos:bool(notifications.pos,true),
      push:bool(notifications.push,true),
      email:bool(notifications.email,false),
      sms:bool(notifications.sms,false),
    },
  };
}

export async function updateBusinessOnlineOrderingSettings(
  locationId:string,
  input:BusinessOnlineOrderingSettings,
){
  const normalized:BusinessOnlineOrderingSettings={
    acceptingOrders:Boolean(input.acceptingOrders),
    autoAccept:Boolean(input.autoAccept),
    autoPrint:Boolean(input.autoPrint),
    defaultPrepMinutes:int(input.defaultPrepMinutes,1,240,25),
    prepDelayMinutes:int(input.prepDelayMinutes,0,240,0),
    pausedUntil:input.pausedUntil&&Number.isFinite(Date.parse(input.pausedUntil))
      ? new Date(input.pausedUntil).toISOString()
      : null,
    timezone:String(input.timezone||"America/New_York").slice(0,120),
    slotMinutes:int(input.slotMinutes,5,120,15),
    maxOrdersPerSlot:input.maxOrdersPerSlot==null?null:int(input.maxOrdersPerSlot,1,1000,20),
    cutoffMinutesBeforeClose:int(input.cutoffMinutesBeforeClose,0,240,15),
    maxAdvanceDays:int(input.maxAdvanceDays,0,90,7),
    orderingHours:cleanHours(input.orderingHours),
    pickupInstructions:String(input.pickupInstructions||"").slice(0,1000),
    notifications:{
      pos:Boolean(input.notifications?.pos),
      push:Boolean(input.notifications?.push),
      email:Boolean(input.notifications?.email),
      sms:Boolean(input.notifications?.sms),
    },
  };
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
  const {data,error}=await shard.client
    .from("pos_ordering_settings")
    .upsert({
      location_id:locationId,
      accepting_orders:normalized.acceptingOrders,
      auto_accept:normalized.autoAccept,
      auto_print:normalized.autoPrint,
      default_prep_minutes:normalized.defaultPrepMinutes,
      prep_delay_minutes:normalized.prepDelayMinutes,
      paused_until:normalized.pausedUntil,
      timezone:normalized.timezone,
      slot_minutes:normalized.slotMinutes,
      max_orders_per_slot:normalized.maxOrdersPerSlot,
      cutoff_minutes_before_close:normalized.cutoffMinutesBeforeClose,
      max_advance_days:normalized.maxAdvanceDays,
      ordering_hours:normalized.orderingHours,
      pickup_instructions:normalized.pickupInstructions||null,
      notification_settings:normalized.notifications,
      updated_at:new Date().toISOString(),
    },{onConflict:"location_id"})
    .select("location_id")
    .single();
  if(error) throw new Error(error.message||"online_order_settings_update_failed");
  return {locationId:String(data.location_id),settings:normalized};
}
