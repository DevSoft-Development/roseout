import "server-only";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {getMapsStandardTask} from "@/lib/location-intelligence/v2/dataforseo-maps-standard";
import {websiteLeadFromMapsItem,googleIdentityLead} from "@/lib/location-intelligence/v2/maps-independent-resolver";
import {resolveOfficialWebsiteLead} from "@/lib/location-intelligence/v2/official-website-resolver";
import {geocodeFreeFirst} from "@/lib/location-intelligence/v2/free-geocoding";
import {getCredentialVaultProviderValues} from "@/lib/admin/credential-vault-runtime-source";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=280;
const RUN_ID="f575c139-1e94-4ca9-9916-a9f6306f5f36";
const TASK_ID="10162316-2703-0066-0000-adb4592275cf";
export async function POST(request:Request) {
 const token=String(process.env.CRON_SECRET||"");
 if(!token||request.headers.get("authorization")!==`Bearer ${token}`)
  return Response.json({ok:false,error:"unauthorized"},{status:401});
 if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background"||
    request.headers.get("x-toh-aws-internal")!=="managed-dispatch")
  return Response.json({ok:false,error:"private_background_only"},{status:403});
 let offset:number;
 try{
  const body=await request.json() as {offset?:unknown;confirmation?:unknown};
  if(body.confirmation!=="verify-original-task-no-writes")throw Error("confirmation");
  offset=Number(body.offset);
  if(!Number.isInteger(offset)||offset<0||offset>40||offset%8!==0)throw Error("offset");
 }catch{return Response.json({ok:false,error:"invalid_batch"},{status:400});}
 const {data:snapshot,error:snapshotError}=await supabaseAdmin.rpc("li_v2_existing_pilot_replay_snapshot",{p_run_id:RUN_ID});
 if(snapshotError||(snapshot as {task_id?:unknown}|null)?.task_id!==TASK_ID)
  return Response.json({ok:false,error:"task_identity_not_verified"},{status:409});
 const purchased=await getMapsStandardTask(TASK_ID);
 if(purchased.status!=="ready")return Response.json({ok:false,error:"original_task_not_ready"},{status:409});
 const seen=new Set<string>(),origins:{origin:string;raw:unknown}[]=[];
 for(const raw of purchased.items.slice(0,50)){
  const origin=websiteLeadFromMapsItem(raw);
  if(origin&&!seen.has(origin)){seen.add(origin);origins.push({origin,raw});}
 }
 const group=origins.slice(offset,offset+8);
 const counts:Record<string,number>={};
 const add=(reason:string)=>{counts[reason]=(counts[reason]||0)+1;};
 const geo=await getCredentialVaultProviderValues("geoapify").catch(()=>({apiKey:""}));
 for(const {origin,raw} of group){
  try{
   const result=await resolveOfficialWebsiteLead(origin);
   if(result.status==="needs_independent_evidence"||!result.candidate){add(result.reason||"independent_evidence_missing");continue;}
   const candidate=result.candidate;
   const item=(raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{}) as Record<string,unknown>;
   // Diagnostic only: preserve distinctions between provider-derived assertions and independent proof.
   const status=String(item.business_status||item.businessStatus||item.status||"").toLowerCase();
   const providerOpen=["open","opened","operational","operating"].includes(status);
   const providerClosed=["closed_forever","permanently_closed","permanently closed","closed_permanently"].includes(status);
   if(providerClosed){add("provider_reports_permanently_closed");continue;}
   const googleIdentity=googleIdentityLead(raw);
   if(!googleIdentity)add("google_photo_identity_missing");
   if(providerOpen)add("provider_claims_open_unconfirmed");
   // Unknown hours do not prove closure. Diagnose geocoding while withholding approval.
   const operatingStatusConfirmed=candidate.openStatus==="open";
   const diagnostics:string[]=[];
   const location=await geocodeFreeFirst({street:candidate.address!,city:candidate.city!,state:candidate.state!,zip:candidate.zip},
     {geoapifyKey:String(geo.apiKey||""),onDiagnostic:d=>diagnostics.push(d.provider+"_"+d.reason)});
   if(!location){add(operatingStatusConfirmed?"geocode_"+(diagnostics.at(-1)||"unconfirmed"):"operating_status_unverified_and_geocode_unconfirmed");continue;}
   add(operatingStatusConfirmed?"independently_verified_geocoded":"operating_status_unverified_geocode_confirmed");
  }catch{add("verification_request_failed");}
 }
 return Response.json({ok:true,readonly:true,noNewDiscoveryPurchase:true,
  stagingAttempted:false,publicationAttempted:false,replayAuthorized:false,
  offset,attempted:group.length,totalDistinctWebsiteLeads:origins.length,reasonCounts:counts});
}
