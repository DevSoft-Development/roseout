import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_QUERIES = 100;

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => asArray(value).map((x)=>String(x ?? "").trim()).filter(Boolean);
const numberOrNull = (value: unknown) => { const n=Number(value); return Number.isFinite(n)?n:null; };
const origin = () => (process.env.CONSUMER_APP_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/,"");

function speed(ms:number|null){ if(ms==null)return null; if(ms<1000)return"fast"; if(ms<2000)return"good"; if(ms<4000)return"slow"; return"critical"; }

function summarize(index:number, query:string, result:any, elapsed:number, responseOk:boolean, caught?:unknown) {
  const debug=result?.debug ?? {};
  const intent=debug?.normalizedIntent ?? result?.normalizedIntent ?? result?.searchV2?.searchPlan ?? {};
  const restaurants=asArray(result?.restaurants).length;
  const activities=asArray(result?.activities).length;
  const pairs=asArray(result?.pairs).length;
  const cards=asArray(result?.cards).length;
  const resultCount=cards || restaurants+activities+pairs;
  const timing=result?.timing ?? result?.searchV2?.timing ?? debug?.timing ?? {};
  const totalMs=numberOrNull(timing?.totalMs ?? timing?.total_ms ?? result?.timing_ms) ?? elapsed;
  const errors=[
    ...strings(result?.errors),
    ...strings(debug?.errors),
    ...(result?.error ? [typeof result.error==="string"?result.error:JSON.stringify(result.error)] : []),
    ...(caught ? [caught instanceof Error ? caught.message : String(caught)] : []),
  ];
  const warnings=[...strings(result?.warnings),...strings(debug?.warnings)];
  const normalizedType=String(intent?.searchType ?? intent?.mode ?? result?.search_type ?? result?.searchType ?? "") || null;
  const primaryDomain=String(intent?.primaryDomain ?? result?.primary_domain ?? result?.primaryDomain ?? "") || null;
  const mixed=primaryDomain==="mixed" || normalizedType==="paired_outing" || normalizedType==="same_venue";
  const noResults=resultCount===0;
  const mixedNoPairs=mixed && pairs===0;
  const passed=responseOk && errors.length===0 && !noResults && !mixedNoPairs;
  const suspiciousFlags=[
    ...(errors.length?["errors"]:[]),
    ...(warnings.length?["warnings"]:[]),
    ...(noResults?["no_results"]:[]),
    ...(mixedNoPairs?["mixed_no_pairs"]:[]),
    ...(speed(totalMs)==="slow"?["slow"]:[]),
    ...(speed(totalMs)==="critical"?["critical_speed"]:[]),
  ];
  return {
    index,query,ok:passed,testPassed:passed,engine:"consumer_service",executionPath:"/api/generate",
    assignedEngine:String(result?.assignedEngine ?? debug?.assignedEngine ?? "") || null,
    normalized_search_type:normalizedType,primary_domain:primaryDomain,
    restaurant_count:restaurants,activity_count:activities,pair_count:pairs,result_count:resultCount,
    fallback_pair_count:Number(result?.fallback_pair_count ?? debug?.fallbackPairCount ?? 0) || 0,
    fallbackPairsUsedAsPrimary:Boolean(result?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary),
    render_mode:String(result?.render_mode ?? result?.renderMode ?? "") || null,
    timing_ms:totalMs,speed_status:speed(totalMs),
    intentParserSource:String(debug?.intentParserSource ?? intent?.parser?.source ?? "") || null,
    llm_ms:numberOrNull(timing?.llmMs ?? timing?.llm_ms ?? debug?.llm_ms),
    no_results_reason:noResults ? String(result?.no_results_reason ?? debug?.no_results_reason ?? "no_renderable_results") : null,
    no_pairs_reason:mixedNoPairs ? String(result?.no_pairs_reason ?? debug?.no_pairs_reason ?? "no_valid_pair") : null,
    warnings,errors,suspiciousFlags,
  };
}

export async function POST(request: NextRequest) {
  const auth=await requireAdminApiRole(["superadmin","admin","experience_team"]);
  if(auth.error)return auth.error;
  const body=await request.json().catch(()=>({}));
  const queries=strings(body?.queries).slice(0,Math.min(MAX_QUERIES,Math.max(1,Number(body?.maxQueries)||MAX_QUERIES)));
  if(!queries.length)return NextResponse.json({ok:false,error:"At least one query is required."},{status:400});
  const includeFullDebug=body?.includeFullDebug!==false;
  const delayMs=Math.min(5000,Math.max(0,Number(body?.delayMs)||0));
  const startedAt=new Date();
  const summary:any[]=[]; const results:any[]=[];
  for(const [index,query] of queries.entries()){
    const started=Date.now(); const requestId=crypto.randomUUID(); let payload:any={}; let responseOk=false; let caught:unknown=null;
    try{
      const response=await fetch(`${origin()}/api/generate`,{
        method:"POST",
        headers:{"content-type":"application/json","x-request-id":requestId},
        body:JSON.stringify({input:query}),
        cache:"no-store",
      });
      responseOk=response.ok;
      payload=await response.json().catch(()=>({error:`Unreadable consumer search response (${response.status})`}));
    }catch(error){caught=error;payload={success:false,error:error instanceof Error?error.message:String(error),requestId};}
    const row=summarize(index,query,payload,Date.now()-started,responseOk,caught);
    summary.push(row); results.push(includeFullDebug?{index,query,summary:row,result:payload}:{index,query,summary:row});
    if(index<queries.length-1 && delayMs)await new Promise((resolve)=>setTimeout(resolve,delayMs));
  }
  const finishedAt=new Date();
  const passedCount=summary.filter((r)=>r.testPassed).length;
  return NextResponse.json({
    ok:true,executionSucceeded:true,allPassed:passedCount===summary.length,
    engine:"consumer_service",executionPath:"/api/generate",parityMode:true,parityContract:"consumer_service_boundary",
    startedAt:startedAt.toISOString(),finishedAt:finishedAt.toISOString(),count:summary.length,
    passedCount,failedCount:summary.length-passedCount,summary,results,
  });
}
