import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabase-admin";

export async function GET(request:NextRequest) {
 const locationId=request.nextUrl.searchParams.get("locationId")||"";
 if(!/^[0-9a-f-]{36}$/i.test(locationId))return NextResponse.json({attribution:null},{status:400});
 const {data:location,error}=await supabaseAdmin.from("locations")
  .select("id,import_source,import_source_id,main_image,is_searchable,public_visibility_tier")
  .eq("id",locationId).maybeSingle();
 if(error||!location||location.is_searchable!==true||location.public_visibility_tier==="hidden"||location.import_source!=="li_v2_independent")
  return NextResponse.json({attribution:null},{headers:{"Cache-Control":"public, max-age=120"}});
 const {data:stage,error:stageError}=await supabaseAdmin.from("location_import_staging")
  .select("raw_payload,main_image").eq("source",location.import_source)
  .eq("source_id",location.import_source_id).eq("import_status","published").maybeSingle();
 if(stageError)return NextResponse.json({attribution:null},{status:503});
 const evidence=stage?.raw_payload?.independent_profile?.wikimediaEvidence;
 if(!evidence || stage?.main_image!==location.main_image || evidence.imageUrl!==location.main_image ||
   typeof evidence.author!=="string" || typeof evidence.license!=="string" ||
   !String(evidence.filePageUrl||"").startsWith("https://commons.wikimedia.org/wiki/File:") ||
   !String(evidence.licenseUrl||"").startsWith("https://creativecommons.org/licenses/"))
   return NextResponse.json({attribution:null});
 return NextResponse.json({attribution:{author:evidence.author,license:evidence.license,
   licenseUrl:evidence.licenseUrl,sourceUrl:evidence.filePageUrl}},
   {headers:{"Cache-Control":"public, max-age=120"}});
}
