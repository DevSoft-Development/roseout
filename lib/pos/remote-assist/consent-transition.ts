import {authorizeAssistCommand, isValidSessionTransition, type AssistSession} from "./session-policy";
export type AssistActor = {id:string; authenticated:boolean; supportRole:boolean; deviceAssigned:boolean; locationAuthorized:boolean; isCustomerApprover:boolean};
export type AssistOperation = "approve"|"activate"|"revoke"|"end";
export type AssistDecision = {ok:true; next:AssistSession}|{ok:false; reason:"unauthorized"|"invalid_transition"|"invalid_consent"};
/** Pure transition authorization. Storage/API must atomically compare version and append audit. */
export function decideAssistTransition(input:{session:AssistSession;actor:AssistActor;operation:AssistOperation;now:number;deviceCaptureApproved?:boolean}):AssistDecision {
 const {session:s,actor:a}=input;
 if(!a.authenticated||!a.locationAuthorized||!a.deviceAssigned)return {ok:false,reason:"unauthorized"};
 const terminal=["ended","revoked","expired"].includes(s.state);
 if(terminal)return {ok:false,reason:"invalid_transition"};
 const nowIso=new Date(input.now).toISOString();
 let next:AssistSession;
 switch(input.operation){
  case "approve":
   if(!a.isCustomerApprover||a.id===s.requestedBy||s.state!=="requested")return {ok:false,reason:"unauthorized"};
   next={...s,state:"approved",approvedBy:a.id,consentExpiresAt:new Date(input.now+15*60_000).toISOString(),version:s.version+1};
   break;
  case "activate":
   if(!a.supportRole||a.id!==s.requestedBy||s.state!=="approved"||!input.deviceCaptureApproved)return {ok:false,reason:"invalid_consent"};
   if(!authorizeAssistCommand({session:s,locationId:s.locationId,deviceId:s.deviceId,technicianId:a.id,permissionGranted:true,assignedToLocation:true,action:"screen_share",now:input.now}))return {ok:false,reason:"unauthorized"};
   next={...s,state:"active",version:s.version+1};
   break;
  case "revoke":
   if(!a.isCustomerApprover&&!a.supportRole)return {ok:false,reason:"unauthorized"};
   next={...s,state:"revoked",endedAt:nowIso,version:s.version+1};
   break;
  case "end":
   if(!a.supportRole||a.id!==s.requestedBy)return {ok:false,reason:"unauthorized"};
   next={...s,state:"ended",endedAt:nowIso,version:s.version+1};
 }
 return isValidSessionTransition(s,next)?{ok:true,next}:{ok:false,reason:"invalid_transition"};
}
