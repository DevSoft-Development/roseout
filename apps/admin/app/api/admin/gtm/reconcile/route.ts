import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { CRM_WRITE_ROLES } from '@/lib/crm/permissions';
import { reconcileGtmCatalog, reconcileGtmLocation } from '@/lib/gtm/orchestrator';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

export async function POST(req:NextRequest){
  const auth=await requireAdminApiRole(CRM_WRITE_ROLES); if(auth.error) return auth.error;
  const body=await req.json().catch(()=>({}));
  try{
    const result=body.locationId?await reconcileGtmLocation(String(body.locationId),{dryRun:Boolean(body.dryRun)}):await reconcileGtmCatalog({limit:Number(body.limit||500),dryRun:Boolean(body.dryRun)});
    return NextResponse.json({success:true,...result});
  }catch(error:any){return NextResponse.json({success:false,error:error?.message||'GTM reconciliation failed'},{status:500});}
}
