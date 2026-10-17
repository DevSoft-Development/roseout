import crypto from "node:crypto";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
export const dynamic = "force-dynamic";
function decrypt(value:string){
 const key=process.env.CLAIM_POSTCARD_ENCRYPTION_KEY;
 if(!key||!/^[a-f0-9]{64}$/i.test(key))throw new Error("missing_encryption_key");
 const [iv,tag,payload]=value.split(".").map(x=>Buffer.from(x,"base64url"));
 const decipher=crypto.createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(payload),decipher.final()]).toString("utf8");
}
const esc=(s:string)=>s.replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]!));
export async function POST(req:Request){
 const auth=await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
 if(auth.error)return auth.error;
 const {id}=await req.json().catch(()=>({}));
 if(!/^[0-9a-f-]{36}$/i.test(String(id)))return Response.json({error:"invalid_id"},{status:400});
 const apiKey=process.env.LOB_API_KEY||"";
 const from=process.env.LOB_FROM_ADDRESS_ID||"";
 if(!/^(test|live)_/.test(apiKey)||!/^adr_/.test(from))
 return Response.json({error:"mail_provider_unconfigured"},{status:503});
 if(apiKey.startsWith("live_")&&process.env.CLAIM_POSTCARD_LIVE_ENABLED!=="true")
 return Response.json({error:"live_mailing_disabled"},{status:403});
 const db=getAdminDatabaseClient();
 const {data:locked,error:lockError}=await db.from("claim_postcard_challenges")
 .update({status:"sending"}).eq("id",id).eq("status","awaiting_fulfillment")
 .gt("expires_at",new Date().toISOString())
 .select("id,location_id,encrypted_verification_code,address_snapshot").maybeSingle();
 if(lockError||!locked)return Response.json({error:"already_sent_or_unavailable"},{status:409});
 let response:Response;
 try{
 const address=locked.address_snapshot as {name:string,address:string,city:string,state:string,zip_code:string};
 const code=decrypt(locked.encrypted_verification_code);
 const htmlCode=esc(code);
 const body={
 description:"TheOutHaven claim address verification",
 to:{name:address.name,address_line1:address.address,address_city:address.city,address_state:address.state,address_zip:address.zip_code},
 from, size:"4x6",use_type:"operational",
 front:'<html><body style="font-family:Arial;text-align:center"><h1>TheOutHaven</h1><p>Business address verification</p></body></html>',
 back:`<html><body style="font-family:Arial"><h2>Verify your business address</h2><p>Enter this code in your TheOutHaven claim portal:</p><h1>${htmlCode}</h1><p>This code expires 30 days after the request. Verification does not automatically grant ownership.</p></body></html>`
 };
 response=await fetch("https://api.lob.com/v1/postcards",{
 method:"POST",headers:{"Authorization":"Basic "+Buffer.from(apiKey+":").toString("base64"),"Content-Type":"application/json","Idempotency-Key":"toh-claim-postcard-"+id},
 body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const parsed=await response.json().catch(()=>({}));
 if(!response.ok||!/^psc_/.test(String(parsed.id||"")))throw new Error("mail_provider_rejected");
 const {error:saveError}=await db.from("claim_postcard_challenges").update({status:"mailed",mailed_at:new Date().toISOString(),provider_reference:String(parsed.id)})
 .eq("id",id).eq("status","sending");
 if(saveError)throw new Error("dispatch_record_update_failed");
 return Response.json({ok:true,providerAccepted:true,testMode:apiKey.startsWith("test_"),ownershipApproved:false});
 }catch{
 await db.from("claim_postcard_challenges").update({status:"awaiting_fulfillment"}).eq("id",id).eq("status","sending");
 return Response.json({error:"postcard_dispatch_failed"},{status:503});
 }
}
