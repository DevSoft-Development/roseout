import { supabaseAdmin } from "@/lib/supabase-admin";
import { createTheOutHavenSearchV3, type TheOutHavenSearchV3Client } from "@/lib/search/v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LOCATION_ID = "0f9c90fa-c73a-4d8b-970d-8c51bec9e968";

/** Read-only certification from the protected AWS background runtime. */
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  if (process.env.PLATFORM_RUNTIME_PROVIDER !== "aws-background" ||
      request.headers.get("x-toh-aws-internal") !== "managed-dispatch")
    return Response.json({ok:false,error:"private_aws_only"},{status:403});
  const {confirmation}=await request.json().catch(()=>({confirmation:""}));
  if(confirmation!=="certify-superiority-native-v3-readonly")
    return Response.json({ok:false,error:"confirmation_required"},{status:400});
  const {data:location,error}=await supabaseAdmin.from("locations")
    .select("id,name,import_source,import_source_id,is_searchable,duplicate_status,has_photos")
    .eq("id",LOCATION_ID).single();
  if(error||!location||location.import_source!=="li_v2_independent"||
    location.is_searchable!==true||location.has_photos!==true||
    location.duplicate_status!=="unique")
    return Response.json({ok:false,error:"published_identity_not_verified"},{status:422});
  const {data:stage,error:stageError}=await supabaseAdmin.from("location_import_staging")
    .select("id,duplicate_status").eq("source",location.import_source)
    .eq("source_id",location.import_source_id).eq("import_status","published").limit(1).maybeSingle();
  if(stageError||!stage||stage.duplicate_status!=="unique")
    return Response.json({ok:false,error:"published_staging_not_verified"},{status:422});
  const {data:profile,error:profileError}=await supabaseAdmin.from("location_intelligence_profiles_v2")
    .select("search_v3_ready").eq("location_id",LOCATION_ID).maybeSingle();
  if(profileError||profile?.search_v3_ready!==true)
    return Response.json({ok:false,error:"search_v3_readiness_missing"},{status:422});
  try {
    const v3=createTheOutHavenSearchV3(supabaseAdmin as unknown as TheOutHavenSearchV3Client);
    const execution=await v3.orchestrator.execute({requestId:"li-v2-native-certification:"+LOCATION_ID,query:location.name,limit:30});
    // Inspect the returned result structure, not arbitrary JSON text fragments.
    const ids=new Set<string>();
    const walk=(value:unknown,depth=0):void=>{
      if(depth>12||!value||typeof value!=="object")return;
      if(Array.isArray(value)){for(const item of value)walk(item,depth+1);return;}
      const row=value as Record<string,unknown>;
      for(const key of ["id","locationId","location_id"]){
        if(typeof row[key]==="string"&&row[key]===LOCATION_ID)ids.add(LOCATION_ID);
      }
      for(const item of Object.values(row))if(typeof item==="object")walk(item,depth+1);
    };
    walk(execution);
    if(!ids.has(LOCATION_ID))
      return Response.json({ok:false,error:"native_search_v3_location_not_returned",locationId:LOCATION_ID},{status:422});
    return Response.json({ok:true,nativeSearchV3RetrievalCertified:true,locationId:LOCATION_ID,paidPilotCertified:false});
  }catch(e){
    return Response.json({ok:false,error:"native_search_v3_execution_failed"},{status:422});
  }
}
