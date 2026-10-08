import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PosPlan = "none"|"essentials_plus"|"signature_plus";

const ACTIVE_STATUSES=new Set(["active","trialing","past_due"]);
const SIGNATURE_PLANS=new Set(["signature_plus","signature+","signature","premium","enterprise"]);
const ESSENTIALS_PLANS=new Set(["essentials_plus","essentials+","essentials"]);

function normalize(value:unknown){return String(value??"").trim().toLowerCase().replace(/\s+/g,"_");}

export function normalizePosPlan(value:unknown):PosPlan{
  const plan=normalize(value);
  if(SIGNATURE_PLANS.has(plan)) return "signature_plus";
  if(ESSENTIALS_PLANS.has(plan)) return "essentials_plus";
  return "none";
}

export async function getPosPlanForLocation(locationId:string):Promise<PosPlan>{
  if(!locationId) return "none";
  const {data,error}=await supabaseAdmin
    .from("business_subscriptions")
    .select("plan,status,location_id,created_at")
    .eq("location_id",locationId)
    .order("created_at",{ascending:false})
    .limit(10);
  if(error) throw new Error(error.message||"pos_entitlement_lookup_failed");
  for(const row of data||[]){
    if(!ACTIVE_STATUSES.has(normalize(row.status))) continue;
    const plan=normalizePosPlan(row.plan);
    if(plan!=="none") return plan;
  }
  return "none";
}

export async function requireSignaturePlusAccess(locationId:string){
  const plan=await getPosPlanForLocation(locationId);
  if(plan!=="signature_plus") throw new Error("pos_signature_plus_required");
  return {plan};
}


export async function requirePosAccess(locationId:string){
  const plan=await getPosPlanForLocation(locationId);
  if(plan==="none") throw new Error("pos_access_required");
  return {plan};
}
