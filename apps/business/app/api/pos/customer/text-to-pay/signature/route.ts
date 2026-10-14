import {createHash,randomUUID} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {hashTextToPayToken} from "@/lib/pos/payments/text-to-pay-session";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
export const dynamic="force-dynamic";export const runtime="nodejs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const deny=(status:number)=>NextResponse.json({error:"signature_unavailable"},{status,headers});
export async function POST(req:NextRequest){
 if(process.env.POS_TEXT_TO_PAY_CUSTOMER_SIGNATURE_ENABLED!=="true")return deny(503);
 if(Number(req.headers.get("content-length")||0)>1400000)return deny(413);
 let body:{locationId?:string;token?:string;pngBase64?:string;agreementSha256?:string};
 try{
  const raw=await req.text();
  if(raw.length>1400000)throw Error("too_large");
  body=JSON.parse(raw);
 }catch{return deny(400);}
 if(!body||!UUID.test(String(body.locationId||""))||
  !/^[a-f0-9]{64}$/.test(String(body.agreementSha256||""))||
  typeof body.pngBase64!=="string"||body.pngBase64.length>1350000||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(body.pngBase64))return deny(400);
 try{
  const hash=hashTextToPayToken(String(body.token||""));
  const png=Buffer.from(body.pngBase64,"base64");
  if(!png.length||png.length>1024*1024||png.length<33||
   !png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
   png.toString("ascii",12,16)!=="IHDR"||
   png.readUInt32BE(16)<1||png.readUInt32BE(16)>2200||
   png.readUInt32BE(20)<1||png.readUInt32BE(20)>1200)return deny(400);
  const shard=await resolveOperationalShardForLocationId(String(body.locationId),{mode:"write"});
  const found=await shard.client.from("pos_text_to_pay_sessions")
   .select("id,check_id,tender_id,status,expires_at,agreement_sha256,signature_storage_key")
   .eq("location_id",body.locationId).eq("token_sha256",hash).maybeSingle();
  const session=found.data;
  if(found.error||!session||session.status!=="accepted"||
   Date.parse(session.expires_at)<=Date.now()||
   session.agreement_sha256!==body.agreementSha256||session.signature_storage_key)return deny(409);
  const storageKey=`pos-evidence/${body.locationId}/${session.tender_id}/${randomUUID()}.png`;
  const upload=await shard.client.storage.from("pos-transaction-evidence")
   .upload(storageKey,png,{contentType:"image/png",cacheControl:"private,max-age=0",upsert:false});
  if(upload.error)return deny(503);
  const sha256=createHash("sha256").update(png).digest("hex");
  const when=new Date().toISOString();
  const saved=await shard.client.from("pos_text_to_pay_sessions")
   .update({signature_storage_key:storageKey,signature_sha256:sha256,signature_signed_at:when})
   .eq("id",session.id).eq("status","accepted").is("signature_storage_key",null)
   .select("id").maybeSingle();
  if(saved.error||!saved.data){
   await shard.client.storage.from("pos-transaction-evidence").remove([storageKey]);
   return deny(409);
  }
  return NextResponse.json({ok:true,signatureRecorded:true},{headers});
 }catch{return deny(404);}
}
