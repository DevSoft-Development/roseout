import crypto from "node:crypto";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { lookupSecureClaim } from "@/lib/business-claim/secureClaim";
export const dynamic = "force-dynamic";
const digest=(v:string)=>crypto.createHash("sha256").update(v).digest("hex");
const BUCKET="claim_postcard_challenges";
async function currentUser(){const db=await createClient();const {data}=await db.auth.getUser();return data.user;}
export async function POST(req:Request){
 const user=await currentUser();if(!user)return Response.json({error:"auth_required"},{status:401});
 const body=await req.json().catch(()=>({}));
 const lookup=await lookupSecureClaim(String(body.code||""));
 if(!lookup.ok)return Response.json({error:"claim_unavailable"},{status:409});
 const l=lookup.location;
 const {data:record,error}=await supabaseAdmin.from("locations").select("id,name,address,city,state,zip_code,is_claimed,owner_user_id")
 .eq("id",l.id).maybeSingle();
 if(error||!record||record.is_claimed||record.owner_user_id||!record.address||!record.city||!record.state||!record.zip_code)
 return Response.json({error:"mailing_address_unavailable"},{status:409});
 const since=new Date(Date.now()-30*86400000).toISOString();
 const {count,error:countError}=await supabaseAdmin.from(BUCKET).select("id",{head:true,count:"exact"})
 .eq("claimant_user_id",user.id).eq("location_id",l.id).gte("created_at",since);
 if(countError)return Response.json({error:"postcard_unavailable"},{status:503});
 if((count??0)>=3)return Response.json({error:"postcard_request_limit"},{status:429});
 const passcode=String(crypto.randomInt(100000000,1000000000)); // Not returned to claimant.
 const {data:created,error:insertError}=await supabaseAdmin.from(BUCKET).insert({
 location_id:l.id,claimant_user_id:user.id,claim_code_hash:digest(lookup.code),
 verification_hash:digest(passcode),
 address_snapshot:{name:record.name,address:record.address,city:record.city,state:record.state,zip_code:record.zip_code}
 }).select("id,expires_at").single();
 if(insertError||!created)return Response.json({error:"postcard_unavailable"},{status:503});
 // A separate privileged fulfillment worker must obtain the code securely.
 // Never assert that mail was dispatched until provider confirms acceptance.
 return Response.json({ok:true,challengeId:created.id,status:"awaiting_fulfillment",expiresAt:created.expires_at,
 message:"Postcard request received. Mailing must be confirmed before you can verify the code.",ownershipApproved:false});
}
export async function PUT(req:Request){
 const user=await currentUser();if(!user)return Response.json({error:"auth_required"},{status:401});
 const body=await req.json().catch(()=>({}));
 const id=String(body.challengeId||""),code=String(body.verificationCode||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9]{9}$/.test(code))
 return Response.json({error:"invalid_code"},{status:400});
 const {data,error}=await supabaseAdmin.rpc("redeem_claim_postcard",{p_id:id,p_user:user.id,p_code:code});
 if(error)return Response.json({error:"verification_unavailable"},{status:503});
 if(!data)return Response.json({ok:false,error:"invalid_or_expired_code"},{status:409});
 return Response.json({ok:true,verified:true,ownershipApproved:false,
 message:"Mailing-address access verified. Ownership approval still requires administrator review."});
}
