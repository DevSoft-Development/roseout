import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { getPosTransactionEvidenceMetadata, storeVerifiedPosSignature } from "@/lib/pos/payments/transaction-evidence";

export const dynamic = "force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

async function authorize(locationId:string){
  if(!uuid.test(locationId)) return false;
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user) return false;
  const access=await getLocationOwnerAccess(user.id,user.email);
  // Payment evidence must never use the demo handoff or view-only impersonation.
  return access.isSuperadmin || access.ownedLocationIds.includes(locationId);
}
const response=(status:number,error:string)=>NextResponse.json({ok:false,error},{status,headers});
export async function GET(request:NextRequest){
  const locationId=request.nextUrl.searchParams.get("locationId")||"";
  const tenderId=request.nextUrl.searchParams.get("tenderId")||"";
  if(!uuid.test(locationId)||!uuid.test(tenderId))return response(400,"invalid_identifier");
  if(!await authorize(locationId))return response(403,"forbidden");
  try{
    const evidence=await getPosTransactionEvidenceMetadata(locationId,tenderId);
    return NextResponse.json({ok:true,evidence},{headers});
  }catch{return response(503,"evidence_unavailable");}
}
// The legacy owner-session signature submission is deliberately disabled.
// A business login does not constitute customer presence or signing consent.
// The trusted device flow must obtain a short-lived transaction-bound token,
// verify its device binding and atomically consume its nonce before storage.
export async function POST(_request:NextRequest){
  return response(503,"customer_signature_session_required");
}
