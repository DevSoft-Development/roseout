import {NextRequest,NextResponse} from "next/server";
import {hashTextToPayToken} from "@/lib/pos/payments/text-to-pay-session";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const failure=(status:number)=>NextResponse.json({error:"checkout_unavailable"},{status,headers});
async function load(request:NextRequest,params:{locationId:string;token:string}){
 if(process.env.POS_TEXT_TO_PAY_CUSTOMER_REVIEW_ENABLED!=="true")throw Error("not_certified");
 if(!UUID.test(params.locationId))throw Error("invalid_location");
 const tokenHash=hashTextToPayToken(params.token);
 const shard=await resolveOperationalShardForLocationId(params.locationId,{mode:"write"});
 const row=await shard.client.from("pos_text_to_pay_sessions")
  .select("id,location_id,check_id,tender_id,amount_cents,currency,agreement_sha256,status,expires_at")
  .eq("location_id",params.locationId).eq("token_sha256",tokenHash).maybeSingle();
 if(row.error||!row.data||Date.parse(row.data.expires_at)<=Date.now()||
  !["issued","reviewed","accepted"].includes(row.data.status))throw Error("invalid_session");
 return {shard,session:row.data,tokenHash};
}
export async function GET(request:NextRequest){
 const locationId=request.nextUrl.searchParams.get("locationId")||"";
 const token=request.nextUrl.searchParams.get("token")||"";
 try{
  const {session}=await load(request,{locationId,token});
  // No PII, SMS destination or staff identity is returned to a bearer-token holder.
  return NextResponse.json({
   status:session.status,amountCents:session.amount_cents,
   currency:session.currency,agreementSha256:session.agreement_sha256,
   expiresAt:session.expires_at,requiresExplicitAgreement:true,
   paymentEnabled:false
  },{headers});
 }catch{return failure(404);}
}
export async function POST(request:NextRequest){
 if(Number(request.headers.get("content-length")||0)>2048)return failure(413);
 let body:{locationId?:string;token?:string;action?:string;amountCents?:number;agreementSha256?:string};
 try{const raw=await request.text();if(raw.length>2048)return failure(413);body=JSON.parse(raw);}catch{return failure(400);}
 if(!body||!["review","accept"].includes(body.action||""))return failure(400);
 try{
  const {shard,session,tokenHash}=await load(request,{
   locationId:String(body.locationId||""),token:String(body.token||"")
  });
  if(body.amountCents!==session.amount_cents||body.agreementSha256!==session.agreement_sha256)
   return failure(409);
  const from=body.action==="review"?"issued":"reviewed";
  const to=body.action==="review"?"reviewed":"accepted";
  if(session.status!==from)return failure(409);
  const changed=await shard.client.rpc("pos_text_to_pay_advance",{
   p_token_sha256:tokenHash,p_from:from,p_to:to,
   p_amount_cents:session.amount_cents,p_agreement_sha256:session.agreement_sha256
  });
  if(changed.error||changed.data!==true)return failure(409);
  return NextResponse.json({ok:true,status:to,paymentEnabled:false},{headers});
 }catch{return failure(404);}
}
