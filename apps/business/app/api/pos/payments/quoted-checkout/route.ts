import {NextRequest,NextResponse} from "next/server";
import {authenticatePosDeviceCredential} from "@/lib/pos/device-command-service";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {createPolicyQuotedCheckPayment} from "@/lib/pos/payments/transaction-gratuity";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const error=(code:string,status=400)=>NextResponse.json({error:code},{status,headers});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function POST(request:NextRequest){
 if(process.env.POS_CHECKOUT_SERVER_QUOTED_TIPS_ENABLED!=="true")return error("quoted_checkout_not_certified",503);
 const bearer=request.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return error("unauthorized_device",401);
 let device:{deviceId:string;locationId:string};
 try{device=await authenticatePosDeviceCredential({
  deviceId:request.headers.get("x-pos-device-id")||"",credential:bearer.slice(7)
 });}catch{return error("unauthorized_device",401);}
 let body:Record<string,unknown>;
 try{
  const text=await request.text();
  if(Buffer.byteLength(text,"utf8")>4096)return error("invalid_payload",413);
  const decoded=JSON.parse(text);
  if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))return error("invalid_payload");
  body=decoded;
 }catch{return error("invalid_payload");}
 const checkId=String(body.checkId||"");
 if(!UUID.test(checkId))return error("invalid_check_id");
 const {data:location,error:lookupError}=await supabaseAdmin.from("locations")
  .select("id,is_demo,demo_key,stripe_connect_account_id,stripe_connect_charges_enabled,metadata")
  .eq("id",device.locationId).maybeSingle();
 if(lookupError||!location)return error("location_unavailable",503);
 if(location.is_demo!==true&&location.demo_key!=="real_location_mirror_demo")return error("sandbox_location_required",403);
 try{
  const result=await createPolicyQuotedCheckPayment({
   location,checkId,selectedTipBasisPoints:Number(body.selectedTipBasisPoints),
   staffProfileId:null
  });
  return NextResponse.json({ok:true,...result},{headers});
 }catch{return error("checkout_quote_or_payment_unavailable",409);}
}
