import { NextRequest, NextResponse } from 'next/server';
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

import { authorizeAdvancedMlRequest } from "@/lib/ml/admin-ml-auth";

async function auth(req: NextRequest) { return authorizeAdvancedMlRequest(req); }

async function run(body:Record<string, unknown> = {}) {
  const steps:any[]=[];
  const runGroup = async (group: Array<[string, (options:any)=>Promise<any>]>) => {
    const results = await Promise.all(
      group.map(async ([name, fn]) => ({ name, result: await fn(body) })),
    );
    steps.push(...results);
  };

  // Independent feature families can recalculate in parallel. Keeping these
  // sequential can exceed the isolated Admin gateway timeout even when every
  // individual recalculation is healthy.
  await runGroup([
    ['review_intelligence',recalculateReviewIntelligence],
    ['business_quality',recalculateBusinessQuality],
    ['photo_quality',recalculatePhotoQuality],
    ['booking_likelihood',recalculateBookingLikelihood],
    ['result_quality',(o:any)=>recalculatePlaceholder('result_quality',o)],
    ['time_of_day',(o:any)=>recalculatePlaceholder('time_of_day',o)],
    ['personalization',(o:any)=>recalculatePlaceholder('personalization',o)],
    ['duplicate_detection',(o:any)=>recalculatePlaceholder('duplicate_detection',o)],
    ['owner_lead_scoring',recalculateOwnerLeads],
  ]);
  // Pair compatibility consumes market/review features, so preserve this
  // dependency ordering while still removing the unnecessary serial work.
  await runGroup([['market_specific',recalculateMarketSpecific]]);
  await runGroup([['pair_compatibility',recalculatePairCompatibility]]);

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
