import {NextRequest,NextResponse} from "next/server";
import {requireCronRequest} from "@/lib/cron-auth";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {evaluatePosDeviceReadiness} from "@/lib/pos/hardware/health/location-readiness";
import {scheduleFromLocationHours} from "@/lib/pos/hardware/health/operating-hours";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const PAGE_SIZE=150;
const MAX_PAGES=7; // strict bound: 1050 active assignments per invocation
type Assignment={location_id:string;device_id:string;metadata:Record<string,unknown>|null};
type Device={id:string;health_status:string;last_seen_at:string|null};
type Location={id:string;operating_hours:unknown;metadata:Record<string,unknown>|null};

export async function GET(request:NextRequest){
  const authError=requireCronRequest(request);
  if(authError)return authError;
  const start=Number(request.nextUrl.searchParams.get("offset")||0);
  if(!Number.isSafeInteger(start)||start<0||start>1000000||start%PAGE_SIZE!==0){
    return NextResponse.json({success:false,error:"invalid_offset"},{status:400});
  }
  const now=new Date();
  const counts={healthy:0,expected_offline:0,awaiting_startup:0,needs_attention:0,unknown:0};
  let checked=0,offset=start,hasMore=false;
  const attention:{locationId:string;deviceId:string;reason:string}[]=[];
  try{
    for(let page=0;page<MAX_PAGES;page++){
      const {data:rows,error}=await supabaseAdmin.from("pos_hardware_assignments")
        .select("location_id,device_id,metadata")
        .eq("assignment_status","active").order("id")
        .range(offset,offset+PAGE_SIZE-1);
      if(error)throw Error("assignment_read_failed:"+error.message);
      const assignments=(rows||[]) as Assignment[];
      if(!assignments.length){hasMore=false;break;}
      const ids=[...new Set(assignments.map(a=>a.device_id))];
      const locationIds=[...new Set(assignments.map(a=>a.location_id))];
      const [deviceQuery,locationQuery]=await Promise.all([
        supabaseAdmin.from("pos_hardware_devices").select("id,health_status,last_seen_at").in("id",ids),
        supabaseAdmin.from("locations").select("id,operating_hours,metadata").in("id",locationIds),
      ]);
      if(deviceQuery.error||locationQuery.error)throw Error("monitor_read_failed:"+(deviceQuery.error?.message||locationQuery.error?.message));
      const devices=new Map(((deviceQuery.data||[]) as Device[]).map(d=>[d.id,d]));
      const locations=new Map(((locationQuery.data||[]) as Location[]).map(l=>[l.id,l]));
      for(const row of assignments){
        const device=devices.get(row.device_id),location=locations.get(row.location_id);
        const meta=location?.metadata||{};
        const confirmed=Boolean(location&&meta.pos_monitoring_hours_fingerprint===JSON.stringify(location.operating_hours));
        const schedule=confirmed?scheduleFromLocationHours(location?.operating_hours,meta.pos_monitoring_timezone):null;
        let result;
        try{
          result=evaluatePosDeviceReadiness({
            schedule,device:{
              health:device?.health_status||"unknown",
              lastSeenAt:device?.last_seen_at||null,
              required:row.metadata?.monitoring_required!==false,
            },now,
          });
        }catch{result={state:"unknown" as const,reason:"invalid_monitoring_config",operating:false,opensWithinMinutes:null};}
        counts[result.state]++;
        if(result.state==="needs_attention"&&attention.length<50)
          attention.push({locationId:row.location_id,deviceId:row.device_id,reason:result.reason});
        checked++;
      }
      offset+=assignments.length;
      if(assignments.length<PAGE_SIZE){hasMore=false;break;}
      hasMore=true;
    }
    return NextResponse.json({success:true,readOnly:true,checked,counts,attention,
      nextOffset:hasMore?offset:null,hasMore,checkedAt:now.toISOString(),
      productionCertification:false,
      note:"Heartbeat and hours assessment only. No physical-device probe or payment test."});
  }catch(error){
    return NextResponse.json({success:false,error:"pos_monitor_read_failed",details:error instanceof Error?error.message:"unknown"},{status:503});
  }
}
