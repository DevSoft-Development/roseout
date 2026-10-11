import {NextRequest,NextResponse} from "next/server";
import {requireCronRequest} from "@/lib/cron-auth";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {evaluatePosDeviceReadiness,type PosReadinessState} from "@/lib/pos/hardware/health/location-readiness";
import {effectivePosSchedule,isPosSpecialClosure} from "@/lib/pos/hardware/health/special-hours";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const PAGE_SIZE=150;
const MAX_PAGES=80;
const SOFT_DEADLINE_MS=100_000;
type Assignment={id:string;location_id:string;device_id:string;metadata:Record<string,unknown>|null};
type Device={id:string;health_status:string;last_seen_at:string|null};
type Location={id:string;operating_hours:unknown;special_hours:unknown;metadata:Record<string,unknown>|null};
const emptyCounts=()=>({healthy:0,expected_offline:0,awaiting_startup:0,needs_attention:0,unknown:0});
type Counts=ReturnType<typeof emptyCounts>;

export async function GET(request:NextRequest){
  const authError=requireCronRequest(request);
  if(authError)return authError;
  // A new day starts a new run. Partial runs resume at the last committed page.
  // "dry_run" avoids persistent state and notifications completely.
  const dryRun=request.nextUrl.searchParams.get("dry_run")==="1";
  const now=new Date();
  const day=now.toISOString().slice(0,10);
  let run: {id:string;next_offset:number;scanned:number;counts:Counts;status:string}|null=null;
  if(!dryRun){
    const {data:existing,error:lookupError}=await supabaseAdmin.from("pos_monitor_scan_runs")
      .select("id,next_offset,scanned,counts,status").eq("scan_day",day).maybeSingle();
    if(lookupError)return NextResponse.json({success:false,error:"monitor_run_lookup_failed"},{status:503});
    if(existing?.status==="complete")return NextResponse.json({success:true,complete:true,skipped:true,reason:"already_completed",runId:existing.id,counts:existing.counts});
    if(existing)run=existing as typeof run;
    else {
      const {data:created,error}=await supabaseAdmin.from("pos_monitor_scan_runs").insert({scan_day:day})
        .select("id,next_offset,scanned,counts,status").maybeSingle();
      if(error||!created)return NextResponse.json({success:false,error:"monitor_run_create_failed"},{status:503});
      run=created as typeof run;
    }
  }
  let offset=run?.next_offset||0;
  let scanned=run?.scanned||0;
  let counts:Counts={...emptyCounts(),...(run?.counts||{})};
  const started=Date.now();
  let complete=false;
  let pages=0;
  const attention:{locationId:string;deviceId:string;reason:string}[]=[];
  try{
    for(;pages<MAX_PAGES;pages++){
      if(pages>0 && Date.now()-started>=SOFT_DEADLINE_MS)break;
      const {data:rows,error}=await supabaseAdmin.from("pos_hardware_assignments")
        .select("id,location_id,device_id,metadata").eq("assignment_status","active")
        .order("id").range(offset,offset+PAGE_SIZE-1);
      if(error)throw Error("monitor_assignments_read_failed");
      const assignments=(rows||[]) as Assignment[];
      if(!assignments.length){complete=true;break;}
      const deviceIds=[...new Set(assignments.map(x=>x.device_id))];
      const locationIds=[...new Set(assignments.map(x=>x.location_id))];
      const [dq,lq]=await Promise.all([
        supabaseAdmin.from("pos_hardware_devices").select("id,health_status,last_seen_at").in("id",deviceIds),
        supabaseAdmin.from("locations").select("id,operating_hours,special_hours,metadata").in("id",locationIds),
      ]);
      if(dq.error||lq.error)throw Error("monitor_dependencies_read_failed");
      const devices=new Map(((dq.data||[]) as Device[]).map(x=>[x.id,x]));
      const locations=new Map(((lq.data||[]) as Location[]).map(x=>[x.id,x]));
      const pageCounts=emptyCounts();
      const observationsForHistory:{scan_id:string;assignment_id:string;location_id:string;device_id:string;state:PosReadinessState;reason:string;observed_at:string}[]=[];
      const observations:{device_id:string;location_id:string;state:PosReadinessState;reason:string}[]=[];
      for(const assignment of assignments){
        const location=locations.get(assignment.location_id),device=devices.get(assignment.device_id);
        const meta=location?.metadata||{};
        const confirmed=!!location&&meta.pos_monitoring_hours_fingerprint===JSON.stringify(location.operating_hours);
        let state:PosReadinessState="unknown",reason="hours_unverified";
        try{
          const schedule=confirmed?effectivePosSchedule({regularHours:location?.operating_hours,specialHours:location?.special_hours,timeZone:meta.pos_monitoring_timezone,now,confirmedFingerprint:meta.pos_monitoring_hours_fingerprint}):null;
          const result=evaluatePosDeviceReadiness({schedule,device:{
            lastSeenAt:device?.last_seen_at||null,health:device?.health_status||"unknown",
            required:assignment.metadata?.monitoring_required!==false,
          },now});
          state=isPosSpecialClosure(schedule)?(result.state==="healthy"?"healthy":"expected_offline"):result.state;
          reason=isPosSpecialClosure(schedule)?"special_closure":result.reason;
        }catch{state="unknown";reason="invalid_monitoring_config";}
        pageCounts[state]++;
        if(run&&!dryRun)observationsForHistory.push({
          scan_id:run.id,assignment_id:assignment.id,location_id:assignment.location_id,
          device_id:assignment.device_id,state,reason,observed_at:now.toISOString(),
        });
        if(state==="needs_attention"&&attention.length<50)attention.push({locationId:assignment.location_id,deviceId:assignment.device_id,reason});
        // Incidents are recorded, never delivered as owner notifications in this phase.
        if(!dryRun)observations.push({
          device_id:assignment.device_id,location_id:assignment.location_id,state,reason,
        });
      }
      if(!dryRun&&observations.length){
        const {error}=await supabaseAdmin.rpc("pos_monitor_reconcile_incidents",{p_observations:observations});
        if(error)throw Error("monitor_incident_reconcile_failed");
      }
      if(!dryRun&&run&&observationsForHistory.length){
        const {error}=await supabaseAdmin.from("pos_monitor_device_observations")
          .upsert(observationsForHistory,{onConflict:"scan_id,assignment_id"});
        if(error)throw Error("monitor_observations_write_failed");
      }
      for(const key of Object.keys(pageCounts) as (keyof Counts)[])counts[key]+=pageCounts[key];
      scanned+=assignments.length;
      offset+=assignments.length;
      if(!dryRun&&run){
        const {error:progressError}=await supabaseAdmin.from("pos_monitor_scan_runs")
          .update({next_offset:offset,scanned,counts,updated_at:new Date().toISOString()}).eq("id",run.id);
        if(progressError)throw Error("monitor_progress_write_failed");
      }
      if(assignments.length<PAGE_SIZE){complete=true;break;}
    }
    if(!dryRun&&run&&complete){
      // The SQL finalizer recomputes history/counts from uniquely keyed observations.
      // Replay-safe even if a prior attempt stopped after writing some pages.
      const {data,error}=await supabaseAdmin.rpc("pos_monitor_finalize_scan",{p_scan_id:run.id});
      if(error)throw Error("monitor_finalization_failed");
      if(data&&typeof data==="object")counts={...emptyCounts(),...data};
    }
    return NextResponse.json({
      success:complete,complete,dryRun,runId:run?.id||null,scanned,counts,pages,
      nextOffset:complete?null:offset,attention,notificationsSent:0,
      incompleteReason:complete?null:"scan_budget_exhausted",
      note:"No payments, device actions, or merchant alerts."
    },{status:complete?200:503});
  }catch(error){
    if(run&&!dryRun)await supabaseAdmin.from("pos_monitor_scan_runs")
      .update({status:"failed",error:error instanceof Error?error.message:"unknown",updated_at:new Date().toISOString()}).eq("id",run.id);
    return NextResponse.json({success:false,complete:false,scanned,nextOffset:offset,error:"pos_monitor_scan_failed"},{status:503});
  }
}
