import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { preparePosDisputeManifest, renderPrintablePosDisputePacket } from "@/lib/pos/payments/dispute-packet";
import { auditPosEvidenceAccess } from "@/lib/pos/payments/evidence-access-audit";

export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const common={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function GET(request:NextRequest){
  const locationId=request.nextUrl.searchParams.get("locationId")||"";
  const tenderId=request.nextUrl.searchParams.get("tenderId")||"";
  if(!uuid.test(locationId)||!uuid.test(tenderId))
    return NextResponse.json({error:"invalid_identifier"},{status:400,headers:common});
  const auth=await createClient();
  const {data:{user}}=await auth.auth.getUser();
  if(!user)return NextResponse.json({error:"unauthorized"},{status:401,headers:common});
  const permissions=await getLocationOwnerAccess(user.id,user.email);
  if(!permissions.isSuperadmin&&!permissions.ownedLocationIds.includes(locationId))
    return NextResponse.json({error:"forbidden"},{status:403,headers:common});
  try{
    const manifest=await preparePosDisputeManifest(locationId,tenderId);
    await auditPosEvidenceAccess({locationId,tenderId,actorUserId:user.id,action:"export_packet",result:"allowed"});
    const body=renderPrintablePosDisputePacket(manifest);
    return new NextResponse(body,{status:200,headers:{
      ...common,"Content-Type":"text/html; charset=utf-8",
      "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "Content-Disposition":'attachment; filename="pos-evidence-manifest.html"',
    }});
  }catch{return NextResponse.json({error:"packet_unavailable"},{status:503,headers:common});}
}
