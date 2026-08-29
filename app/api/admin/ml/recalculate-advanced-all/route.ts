import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { ADMIN_PAGE_ACCESS } from '@/lib/admin-permissions';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import {
  recalculateBookingLikelihood,
  recalculateBusinessQuality,
  recalculateMarketSpecific,
  recalculateOwnerLeads,
  recalculatePairCompatibility,
  recalculatePhotoQuality,
  recalculatePlaceholder,
  recalculateReviewIntelligence,
} from '@/lib/ml/advanced/recalculate';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

async function auth(req:NextRequest){
  if(isCronRequestAuthorized(req)) return null;
  const a=await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return a.error;
}

async function run(body:Record<string, unknown> = {}) {
  const steps:any[]=[];
  for (const [name,fn] of [
    ['review_intelligence',recalculateReviewIntelligence],
    ['business_quality',recalculateBusinessQuality],
    ['photo_quality',recalculatePhotoQuality],
    ['booking_likelihood',recalculateBookingLikelihood],
    ['result_quality',(o:any)=>recalculatePlaceholder('result_quality',o)],
    ['market_specific',recalculateMarketSpecific],
    ['time_of_day',(o:any)=>recalculatePlaceholder('time_of_day',o)],
    ['pair_compatibility',recalculatePairCompatibility],
    ['personalization',(o:any)=>recalculatePlaceholder('personalization',o)],
    ['duplicate_detection',(o:any)=>recalculatePlaceholder('duplicate_detection',o)],
    ['owner_lead_scoring',recalculateOwnerLeads],
  ] as any[]) {
    steps.push({name, result: await fn(body)});
  }
  return NextResponse.json({success:steps.every(step=>step.result?.ok!==false),steps});
}

export async function GET(req:NextRequest){
  const e=await auth(req); if(e) return e;
  return run();
}

export async function POST(req:NextRequest){
  const e=await auth(req); if(e) return e;
  const body=await req.json().catch(()=>({}));
  return run(body);
}
