import { NextRequest,NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { CRM_WRITE_ROLES } from '@/lib/crm/permissions';
import { enrollClaimOutreach,getClaimOutreachReadiness } from '@/lib/gtm/outreach';
export async function POST(req:NextRequest){const auth=await requireAdminApiRole(CRM_WRITE_ROLES);if(auth.error)return auth.error;const body=await req.json().catch(()=>({})),locationId=String(body.locationId||'');if(!locationId)return NextResponse.json({success:false,error:'locationId is required'},{status:400});try{const result=body.enroll===true?await enrollClaimOutreach(locationId):await getClaimOutreachReadiness(locationId);return NextResponse.json({success:true,result});}catch(error:any){return NextResponse.json({success:false,error:error?.message||'Outreach readiness failed'},{status:500});}}
