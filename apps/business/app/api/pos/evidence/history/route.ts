import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function GET(request:NextRequest){
  const locationId=request.nextUrl.searchParams.get("locationId")||"";
  if(!uuid.test(locationId))return NextResponse.json({error:"invalid_location_id"},{status:400,headers});
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"unauthorized"},{status:401,headers});
  const access=await getLocationOwnerAccess(user.id,user.email);
  if(!access.isSuperadmin&&!access.ownedLocationIds.includes(locationId))
    return NextResponse.json({error:"forbidden"},{status:403,headers});
  try{
    const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
    const {data,error}=await shard.client.from("pos_tenders")
      .select("id,check_id,status,amount_cents,tip_cents,created_at")
      .eq("location_id",locationId).order("created_at",{ascending:false}).limit(50);
    if(error)throw error;
    const tenderIds=(data||[]).map(t=>t.id);
    const evidence=tenderIds.length?await shard.client.from("pos_transaction_evidence")
      .select("id,tender_id,evidence_type,captured_at").eq("location_id",locationId).in("tender_id",tenderIds):
      {data:[],error:null};
    if(evidence.error)throw evidence.error;
    return NextResponse.json({
      ok:true,locationId,
      tenders:(data||[]).map(t=>({...t,evidence:(evidence.data||[]).filter(e=>e.tender_id===t.id)})),
    },{headers});
  }catch{return NextResponse.json({error:"history_unavailable"},{status:503,headers});}
}
