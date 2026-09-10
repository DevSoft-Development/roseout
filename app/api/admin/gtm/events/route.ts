import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { CRM_WRITE_ROLES } from '@/lib/crm/permissions';
import { recordGtmEvent } from '@/lib/gtm/events';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
  const auth=await requireAdminApiRole(CRM_WRITE_ROLES); if(auth.error) return auth.error;
  const body=await req.json().catch(()=>({}));
  if(!body.locationId||!body.eventType) return NextResponse.json({success:false,error:'locationId and eventType are required'},{status:400});
  try{return NextResponse.json({success:true,result:await recordGtmEvent({locationId:String(body.locationId),eventType:String(body.eventType),channel:body.channel||null,source:body.source||'admin_crm',campaignKey:body.campaignKey||null,creatorKey:body.creatorKey||null,referralKey:body.referralKey||null,metadata:body.metadata||{}})});}
  catch(error:any){return NextResponse.json({success:false,error:error?.message||'GTM event failed'},{status:500});}
}
