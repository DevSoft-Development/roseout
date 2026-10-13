import {issueAssistCode,redeemAssistCode,type AssistCodeStore} from "./verification-code";
import {validAssistId} from "./session-policy";

/** Trusted backend principal resolved from authenticated session, never client-supplied roles. */
export type VerificationPrincipal={id:string;authenticated:boolean;supportRole:boolean;locationIds:readonly string[];deviceIds:readonly string[]};
export type VerificationContext={sessionId:string;locationId:string;deviceId:string;technicianId:string;state:"requested"|"approved"|"active"|"revoked"|"ended"|"expired"};
export type VerificationRepository={
 getSession(locationId:string,sessionId:string):Promise<VerificationContext|null>;
 store:AssistCodeStore;
 /** Atomic, durable proof consumed by the activation transaction. */
 markVerified(sessionId:string,technicianId:string):Promise<void>;
};
export type VerifiedDeviceIdentity={deviceId:string;locationId:string;authenticated:true;sessionBound:boolean};
export type VerificationInput={locationId:string;sessionId:string;deviceId:string;code?:string};
export type VerificationResult={ok:true;code?:string}|{ok:false;reason:"unauthenticated"|"forbidden"|"invalid"|"unavailable"};
function authorized(p:VerificationPrincipal,s:VerificationContext,q:VerificationInput):boolean{
 return p.authenticated&&p.supportRole&&p.id===s.technicianId&&
 p.locationIds.includes(q.locationId)&&p.deviceIds.includes(q.deviceId)&&
 s.locationId===q.locationId&&s.deviceId===q.deviceId&&s.sessionId===q.sessionId&&s.state==="approved";
}
/** Code is returned ONLY to a verified device-facing channel; never return it to the support dashboard. */
export async function issueDeviceVerificationCode(input:{
 device:VerifiedDeviceIdentity;request:VerificationInput;repo:VerificationRepository;secret:string;
}):Promise<VerificationResult>{
 const {device:d,request:q}=input;
 if(!d.authenticated||!d.sessionBound)return {ok:false,reason:"unauthenticated"};
 if(![q.locationId,q.sessionId,q.deviceId].every(validAssistId)||d.deviceId!==q.deviceId||d.locationId!==q.locationId)return {ok:false,reason:"forbidden"};
 try{
  const s=await input.repo.getSession(q.locationId,q.sessionId);
  if(!s||s.sessionId!==q.sessionId||s.locationId!==q.locationId||s.deviceId!==q.deviceId||s.state!=="approved")return {ok:false,reason:"forbidden"};
  const code=await issueAssistCode({...s,secret:input.secret,store:input.repo.store,now:Date.now()});
  return {ok:true,code};
 }catch{return {ok:false,reason:"unavailable"};}
}
export async function verifyTechnicianCode(input:{
 principal:VerificationPrincipal;request:VerificationInput;repo:VerificationRepository;secret:string;
}):Promise<VerificationResult>{
 const {principal:p,request:q}=input;
 if(!p.authenticated)return {ok:false,reason:"unauthenticated"};
 if(![q.locationId,q.sessionId,q.deviceId].every(validAssistId)||!/^[0-9]{6}$/.test(q.code??""))return {ok:false,reason:"invalid"};
 try{
  const s=await input.repo.getSession(q.locationId,q.sessionId);
  if(!s||!authorized(p,s,q))return {ok:false,reason:"forbidden"};
  const ok=await redeemAssistCode({...s,code:q.code!,secret:input.secret,store:input.repo.store,now:Date.now()});
  if(!ok)return {ok:false,reason:"invalid"};
  await input.repo.markVerified(q.sessionId,p.id);
  return {ok:true};
 }catch{return {ok:false,reason:"unavailable"};}
}
