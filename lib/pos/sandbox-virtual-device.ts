import "server-only";
import crypto from "crypto";
import {supabaseAdmin} from "@/lib/supabase-admin";

export const SANDBOX_LOUNGE_ID="642a2ad6-c144-47b7-b9ff-f89554edf0da";
const SANDBOX_ID=/^sandbox-[0-9a-f]{32}$/;
const hash=(value:string)=>crypto.createHash("sha256").update(value,"utf8").digest("hex");
const equals=(a:string,b:string)=>{
 if(!/^[0-9a-f]{64}$/.test(a))return false;
 return crypto.timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
};
function assertSandboxEnabled(){
 if(process.env.POS_SANDBOX_VIRTUAL_DEVICES_ENABLED!=="true" ||
   process.env.NODE_ENV!=="production" && process.env.NODE_ENV!=="development")
  throw Error("pos_sandbox_virtual_device_disabled");
}
export async function assertSandboxLounge(locationId:string){
 assertSandboxEnabled();
 if(locationId!==SANDBOX_LOUNGE_ID)throw Error("pos_sandbox_wrong_location");
 const {data,error}=await supabaseAdmin.from("locations")
  .select("id,is_demo,is_hidden,is_searchable,demo_visible_publicly,publish_ready,demo_key")
  .eq("id",locationId).maybeSingle();
 if(error||!data||data.is_demo!==true||data.is_hidden!==true||
 data.is_searchable===true||data.demo_visible_publicly===true||
 data.publish_ready===true||data.demo_key!=="real_location_mirror_demo")
  throw Error("pos_sandbox_location_not_private");
}
export async function issueSandboxVirtualDevice(input:{locationId:string;issuedBy:string}){
 await assertSandboxLounge(input.locationId);
 const id="sandbox-"+crypto.randomBytes(16).toString("hex");
 const credential=crypto.randomBytes(32).toString("base64url");
 const expiresAt=new Date(Date.now()+30*60_000).toISOString();
 const {error}=await supabaseAdmin.from("pos_sandbox_virtual_devices").insert({
  id,location_id:input.locationId,credential_sha256:hash(credential),
  purpose:"pos_checkout_certification",status:"active",expires_at:expiresAt,issued_by:input.issuedBy
 });
 if(error)throw Error("pos_sandbox_issue_failed");
 return {deviceId:id,credential,expiresAt};
}
export async function authenticateSandboxVirtualDevice(input:{deviceId:string;credential:string}){
 assertSandboxEnabled();
 if(!SANDBOX_ID.test(input.deviceId)||!input.credential||input.credential.length>256)
  throw Error("pos_sandbox_invalid_credential");
 const {data,error}=await supabaseAdmin.from("pos_sandbox_virtual_devices")
  .select("location_id,credential_sha256,status,expires_at,purpose")
  .eq("id",input.deviceId).maybeSingle();
 if(error||!data||data.status!=="active"||data.purpose!=="pos_checkout_certification"||
 Date.parse(data.expires_at)<=Date.now()||!equals(String(data.credential_sha256),hash(input.credential)))
  throw Error("pos_sandbox_unauthorized");
 await assertSandboxLounge(String(data.location_id));
 return {deviceId:input.deviceId,locationId:String(data.location_id),sandboxVirtual:true as const};
}
export async function revokeSandboxVirtualDevice(input:{locationId:string;deviceId:string;revokedBy:string}){
 await assertSandboxLounge(input.locationId);
 if(!SANDBOX_ID.test(input.deviceId))throw Error("pos_sandbox_invalid_id");
 const {data,error}=await supabaseAdmin.from("pos_sandbox_virtual_devices")
  .update({status:"revoked",revoked_by:input.revokedBy,revoked_at:new Date().toISOString()})
  .eq("id",input.deviceId).eq("location_id",input.locationId).eq("status","active")
  .select("id").maybeSingle();
 if(error)throw Error("pos_sandbox_revoke_failed");
 return {revoked:Boolean(data)};
}
