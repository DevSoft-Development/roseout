import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { getPosTransactionEvidenceMetadata, storeVerifiedPosSignature } from "@/lib/pos/payments/transaction-evidence";

export const dynamic = "force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

async function authorize(locationId:string){
  if(!uuid.test(locationId)) return false;
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user) return false;
  const access=await getLocationOwnerAccess(user.id,user.email);
  // Payment evidence must never use the demo handoff or view-only impersonation.
  return access.isSuperadmin || access.ownedLocationIds.includes(locationId);
}
const response=(status:number,error:string)=>NextResponse.json({ok:false,error},{status,headers});
export async function GET(request:NextRequest){
  const locationId=request.nextUrl.searchParams.get("locationId")||"";
  const tenderId=request.nextUrl.searchParams.get("tenderId")||"";
  if(!uuid.test(locationId)||!uuid.test(tenderId))return response(400,"invalid_identifier");
  if(!await authorize(locationId))return response(403,"forbidden");
  try{
    const evidence=await getPosTransactionEvidenceMetadata(locationId,tenderId);
    return NextResponse.json({ok:true,evidence},{headers});
  }catch{return response(503,"evidence_unavailable");}
}
export async function POST(request:NextRequest){
  // Explicit deployment gate: a signed-in browser alone must not activate capture.
  if(process.env.POS_CUSTOMER_SIGNATURE_CAPTURE_ENABLED!=="true")return response(503,"signature_capture_not_certified");
  if(!["application/json"].includes(request.headers.get("content-type")?.split(";")[0]||""))return response(415,"unsupported_content_type");
  if(Number(request.headers.get("content-length")||0)>1_500_000)return response(413,"payload_too_large");
  const origin=request.headers.get("origin");
  const host=request.headers.get("host");
  if(!origin||!host){return response(403,"origin_required");}
  try{if(new URL(origin).host!==host)return response(403,"invalid_origin");}catch{return response(403,"invalid_origin");}
  const body=await request.json().catch(()=>null);
  const locationId=String(body?.locationId||"");
  const tenderId=String(body?.tenderId||"");
  const checkId=String(body?.checkId||"");
  if(!uuid.test(locationId)||!uuid.test(tenderId)||!uuid.test(checkId))return response(400,"invalid_identifier");
  if(!await authorize(locationId))return response(403,"forbidden");
  if(body?.source!=="customer_display"||typeof body?.pngBase64!=="string"||body.pngBase64.length>1_400_000||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(body.pngBase64))return response(400,"invalid_signature_payload");
  try{
    const png=Buffer.from(body.pngBase64,"base64");
    const saved=await storeVerifiedPosSignature({locationId,checkId,tenderId,png,source:"customer_display",signedAt:String(body.signedAt||"")});
    return NextResponse.json({ok:true,evidenceId:saved.id,sha256:saved.sha256},{headers});
  }catch{return response(409,"signature_not_stored_check_payment_and_configuration");}
}
