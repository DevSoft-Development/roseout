import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { hasLocationPermission, resolveLocationAccessContext } from "@/lib/auth/locationOwnerAccess";
import { getBusinessOnlineOrderingSettings, updateBusinessOnlineOrderingSettings } from "@/lib/pos/online-ordering/business-settings";

export const dynamic="force-dynamic";

async function accessFor(request:Request){
  const url=new URL(request.url);
  const locationId=String(url.searchParams.get("locationId")||"").trim();
  if(!locationId) return {error:NextResponse.json({ok:false,error:"missing_location_id"},{status:400}),locationId:""};
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return {error:NextResponse.json({ok:false,error:"auth_required"},{status:401}),locationId};
  const access=await resolveLocationAccessContext({
    userId:user.id,
    userEmail:user.email,
    locationId,
  });
  if(!access.canonicalLocationId||access.canonicalLocationId!==locationId||!hasLocationPermission(access,"location.edit")){
    return {error:NextResponse.json({ok:false,error:"online_ordering_settings_forbidden"},{status:403}),locationId};
  }
  return {error:null as NextResponse|null,locationId};
}

export async function GET(request:Request){
  const auth=await accessFor(request);
  if(auth.error) return auth.error;
  try{
    const settings=await getBusinessOnlineOrderingSettings(auth.locationId);
    return NextResponse.json({ok:true,settings},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"online_order_settings_read_failed"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}

export async function PUT(request:Request){
  const auth=await accessFor(request);
  if(auth.error) return auth.error;
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object") return NextResponse.json({ok:false,error:"invalid_settings_payload"},{status:400});
  try{
    const result=await updateBusinessOnlineOrderingSettings(auth.locationId,(body as any).settings||body as any);
    return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"online_order_settings_update_failed";
    return NextResponse.json({ok:false,error:message},{status:/invalid|missing/.test(message)?400:500,headers:{"Cache-Control":"no-store"}});
  }
}
