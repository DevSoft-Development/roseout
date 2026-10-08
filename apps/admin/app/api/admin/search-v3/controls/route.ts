import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { DEFAULT_SEARCH_V3_CONTROLS, readSearchV3Controls, SEARCH_V3_CONTROLS_KEY, validateSearchV3Controls } from "@/lib/search/v3/controls/searchV3Controls";
const READ_ROLES=["superadmin","admin","experience_team"] as const;
export async function GET(){
 const auth=await requireAdminApiRole(READ_ROLES); if(auth.error)return auth.error;
 try {
  const db=getAdminDatabaseClient();
  const [{data:phase},{data:replay},{data:breakerRows,error:breakerError},controls]=await Promise.all([
   db.from("cron_job_runs").select("started_at,status,details").eq("job_key","search-phase13-maintenance").order("started_at",{ascending:false}).limit(1),
   db.from("search_quality_replay_runs").select("id,created_at,completed_at,status,metrics").eq("source","golden").order("created_at",{ascending:false}).limit(1),
   db.from("search_v3_lane_breakers").select("lane_id,failures,open_until,probe_until,updated_at").limit(6),
   readSearchV3Controls(db),
  ]);
  const latest=phase?.[0]??null, golden=replay?.[0]??null;
  const v3=golden?.metrics?.v3??null, comparison=golden?.metrics?.v3VsV2??null;
  const e=latest?.details?.embeddings??{};
  const phaseFresh=latest?.started_at && Date.now()-Date.parse(latest.started_at)<=30*60*1000;
  const replayFresh=golden?.completed_at && Date.now()-Date.parse(golden.completed_at)<=60*60*1000;
  const phasePass=Boolean(phaseFresh)&&latest?.status==="success"&&Number(e.failed)===0&&Number(e.scanned)>0&&Number(e.skippedIneligible)<Number(e.candidatePool)&&Number(e.ready)>=4961&&Number(e.remainingApprox)<=50&&e.timeBudgetReached!==true;
  const noRegression=comparison?.noRegressions??{};
  const replayPass=Boolean(replayFresh)&&golden?.status==="completed"&&!!v3&&!!comparison&&Number(v3.successRate)>=90&&Number(v3.pairSuccessRate)>=90&&Number(v3.noResultRegressionRate)===0&&Number(v3.contractFailureCount)===0&&Number(v3.p95LatencyMs)<=5000&&["successRate","pairSuccessRate","noResultRegressionRate","contractFailures"].every(k=>noRegression[k]===true);
  const rolloutWired=process.env.SEARCH_V3_CANARY_RELEASE_ENABLED==="true"; // Explicit release verification prerequisite.
  const coreHealthy=Object.entries(DEFAULT_SEARCH_V3_CONTROLS.lanes).filter(([id])=>id!=="review_intelligence").every(([id])=>controls.lanes[id as keyof typeof controls.lanes]?.enabled&&!controls.lanes[id as keyof typeof controls.lanes]?.forceOpen);
  return NextResponse.json({controls,breakerHealth:{available:!breakerError,rows:breakerError?[]:breakerRows??[],error:breakerError?"Shared breaker migration or permissions unavailable":null},phase:latest,golden:{id:golden?.id??null,completedAt:golden?.completed_at??null,v3,comparison},gates:{phasePass,replayPass,coreHealthy,rolloutWired,canaryEligible:phasePass&&replayPass&&coreHealthy&&rolloutWired&&!breakerError},runnerUrl:null,promotionWorkflowUrl:"https://github.com/DevSoft-Development/roseout/actions/workflows/search-v3-promotion-gate.yml"});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Failed to load V3 status"},{status:503});}
}
export async function PATCH(request:Request){
 const auth=await requireAdminApiRole(["superadmin","admin"]); if(auth.error)return auth.error;
 const body=await request.json().catch(()=>({}));
 try{
  if(typeof body.reason!=="string"||body.reason.trim().length<8)throw new Error("An audit reason (8+ characters) is required");
  const db=getAdminDatabaseClient(),previous=await readSearchV3Controls(db),next=validateSearchV3Controls(body.config);
  if(next.mode!=="shadow" && process.env.SEARCH_V3_CANARY_RELEASE_ENABLED!=="true") throw new Error("V3 canary is locked until serving-path integration and deployment are verified");
  if(next.mode!=="shadow"){
   const {error:breakerError}=await db.from("search_v3_lane_breakers").select("lane_id").limit(1);
   if(breakerError) throw new Error("Shared Search V3 breaker migration unavailable; canary cannot be enabled");
   const [{data:phase},{data:replay}]=await Promise.all([
    db.from("cron_job_runs").select("status,started_at,details").eq("job_key","search-phase13-maintenance").order("started_at",{ascending:false}).limit(1),
    db.from("search_quality_replay_runs").select("status,metrics,completed_at").eq("source","golden").order("created_at",{ascending:false}).limit(1)
   ]);
   const e=phase?.[0]?.details?.embeddings??{},v3=replay?.[0]?.metrics?.v3,compar=replay?.[0]?.metrics?.v3VsV2;
   const core=Object.entries(next.lanes).filter(([id])=>id!=="review_intelligence").every(([,v])=>v.enabled&&!v.forceOpen);
   if(!core||!phase?.[0]?.started_at||Date.now()-Date.parse(phase[0].started_at)>30*60*1000||!replay?.[0]?.completed_at||Date.now()-Date.parse(replay[0].completed_at)>60*60*1000||phase?.[0]?.status!=="success"||Number(e.failed)!==0||Number(e.scanned)<=0||Number(e.remainingApprox)>50||!v3||!compar||Number(v3.successRate)<90||Number(v3.pairSuccessRate)<90||Number(v3.contractFailureCount)!==0||Number(v3.noResultRegressionRate)!==0||Number(v3.p95LatencyMs)>5000||Object.values(compar.noRegressions??{}).some(v=>v!==true)||!["successRate","pairSuccessRate","noResultRegressionRate","contractFailures"].every(k=>compar.noRegressions?.[k]===true))throw new Error("Production promotion gate not satisfied; keep V3 shadow");
   if(next.mode==="primary")throw new Error("Primary rollout requires a separate controlled approval");
   if(next.canaryPercent>5&&previous.mode==="shadow")throw new Error("Initial canary cannot exceed 5%");
  }
  const now=new Date().toISOString();
  const {error}=await db.from("app_settings").upsert({key:SEARCH_V3_CONTROLS_KEY,value:next,updated_by:auth.adminUser!.user_id,updated_at:now});if(error)throw error;
  const {error:auditError}=await db.from("admin_audit_logs").insert({actor_user_id:auth.adminUser!.user_id,action:"search_v3_controls.updated",entity_type:"app_setting",entity_id:SEARCH_V3_CONTROLS_KEY,summary:body.reason.trim(),metadata:{previous,next,at:now}});
  if(auditError)return NextResponse.json({error:"Configuration saved, but audit logging failed. Escalate immediately."},{status:500});
  return NextResponse.json({success:true,config:next});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid settings"},{status:400});}
}
