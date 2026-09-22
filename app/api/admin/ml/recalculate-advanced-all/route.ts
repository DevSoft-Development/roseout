import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiRole } from '@/lib/admin-api-auth';
import { ADMIN_PAGE_ACCESS } from '@/lib/admin-permissions';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { resolveSearchMlRuntimeConfig } from '@/lib/search/huggingFaceEmbedding';
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

type StageName=
  | 'review_intelligence'
  | 'business_quality'
  | 'photo_quality'
  | 'booking_likelihood'
  | 'result_quality'
  | 'time_of_day'
  | 'personalization'
  | 'duplicate_detection'
  | 'owner_lead_scoring'
  | 'market_specific'
  | 'pair_compatibility';

const stageOrder:StageName[]=[
  'review_intelligence',
  'business_quality',
  'photo_quality',
  'booking_likelihood',
  'result_quality',
  'time_of_day',
  'personalization',
  'duplicate_detection',
  'owner_lead_scoring',
  'market_specific',
  'pair_compatibility',
];

const stageFns:Record<StageName,(options:any)=>Promise<any>>={
  review_intelligence:recalculateReviewIntelligence,
  business_quality:recalculateBusinessQuality,
  photo_quality:recalculatePhotoQuality,
  booking_likelihood:recalculateBookingLikelihood,
  result_quality:(o:any)=>recalculatePlaceholder('result_quality',o),
  time_of_day:(o:any)=>recalculatePlaceholder('time_of_day',o),
  personalization:(o:any)=>recalculatePlaceholder('personalization',o),
  duplicate_detection:(o:any)=>recalculatePlaceholder('duplicate_detection',o),
  owner_lead_scoring:recalculateOwnerLeads,
  market_specific:recalculateMarketSpecific,
  pair_compatibility:recalculatePairCompatibility,
};

async function auth(req:NextRequest){
  if(isCronRequestAuthorized(req)) return null;
  const provided=req.headers.get('authorization');
  const config=await resolveSearchMlRuntimeConfig().catch(()=>null);
  if(config?.token && provided===`Bearer ${config.token}`) return null;
  const a=await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return a.error;
}

function normalizeOptions(input:Record<string,unknown>={}){
  const options:{dryRun?:boolean;limit?:number;daysBack?:number;locationId?:string;userId?:string}={};
  if(typeof input.dryRun==='boolean') options.dryRun=input.dryRun;
  const limit=Number(input.limit);
  if(Number.isFinite(limit) && limit>0) options.limit=Math.floor(limit);
  const daysBack=Number(input.daysBack);
  if(Number.isFinite(daysBack) && daysBack>0) options.daysBack=Math.floor(daysBack);
  if(typeof input.locationId==='string' && input.locationId.trim()) options.locationId=input.locationId.trim();
  if(typeof input.userId==='string' && input.userId.trim()) options.userId=input.userId.trim();
  return options;
}

async function runStage(stage:StageName, options:Record<string,unknown>={}){
  const result=await stageFns[stage](normalizeOptions(options));
  return NextResponse.json({success:result?.ok!==false,stage,result});
}

async function runAll(body:Record<string,unknown>={}){
  const steps:any[]=[];
  const options=normalizeOptions(body);
  const runGroup = async (group:StageName[]) => {
    const results=await Promise.all(group.map(async name=>({name,result:await stageFns[name](options)})));
    steps.push(...results);
  };

  await runGroup([
    'review_intelligence',
    'business_quality',
    'photo_quality',
    'booking_likelihood',
    'result_quality',
    'time_of_day',
    'personalization',
    'duplicate_detection',
    'owner_lead_scoring',
  ]);
  await runGroup(['market_specific']);
  await runGroup(['pair_compatibility']);

  return NextResponse.json({success:steps.every(step=>step.result?.ok!==false),steps});
}

function requestedStage(req:NextRequest, body?:Record<string,unknown>){
  const raw=String(body?.stage??req.nextUrl.searchParams.get('stage')??'').trim();
  return stageOrder.includes(raw as StageName)?raw as StageName:null;
}

function queryOptions(req:NextRequest){
  const out:Record<string,unknown>={};
  for(const key of ['limit','daysBack','locationId','userId']){
    const value=req.nextUrl.searchParams.get(key);
    if(value!==null) out[key]=value;
  }
  const dryRun=req.nextUrl.searchParams.get('dryRun');
  if(dryRun!==null) out.dryRun=dryRun==='true';
  return out;
}

export async function GET(req:NextRequest){
  const e=await auth(req); if(e) return e;
  const stage=requestedStage(req);
  if(stage) return runStage(stage,queryOptions(req));
  return runAll(queryOptions(req));
}

export async function POST(req:NextRequest){
  const e=await auth(req); if(e) return e;
  const body=await req.json().catch(()=>({}));
  const stage=requestedStage(req,body);
  if(stage) return runStage(stage,body);
  return runAll(body);
}
