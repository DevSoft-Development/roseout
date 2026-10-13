import {decideAssistTransition, type AssistActor, type AssistOperation} from "./consent-transition";
import {validAssistId, type AssistSession} from "./session-policy";

/** Server-only adapter contract: implementations must use trusted session identity and central location routing. */
export type AssistTrustedPrincipal = {
 id:string; authenticated:boolean; supportRole:boolean; isCustomerApprover:boolean;
 locationIds:readonly string[]; assignedDeviceIds:readonly string[];
};
export type AssistSessionStore = {
 load(locationId:string,sessionId:string):Promise<AssistSession|null>;
 transition(args:{locationId:string;sessionId:string;expectedVersion:number;actorId:string;action:AssistOperation;captureApproved:boolean}):Promise<AssistSession>;
};
export type AssistTransitionRequest = {
 locationId:string;sessionId:string;deviceId:string;expectedVersion:number;
 action:AssistOperation;captureApproved?:boolean;
};
export type AssistTransitionResult =
 | {ok:true;session:AssistSession}
 | {ok:false;code:"unauthenticated"|"forbidden"|"invalid_request"|"not_found"|"conflict"|"storage_error"};

export async function transitionAssistSession(
 principal:AssistTrustedPrincipal,request:AssistTransitionRequest,store:AssistSessionStore
):Promise<AssistTransitionResult> {
 if(!principal.authenticated||!validAssistId(principal.id))return {ok:false,code:"unauthenticated"};
 if(![request.locationId,request.sessionId,request.deviceId].every(validAssistId)||
 !Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<1||
 !["approve","activate","revoke","end"].includes(request.action))return {ok:false,code:"invalid_request"};
 if(!principal.locationIds.includes(request.locationId)||!principal.assignedDeviceIds.includes(request.deviceId))
  return {ok:false,code:"forbidden"};
 // Capture approval must come from a verified native-device assertion, not request JSON.
 if(request.action==="activate"&&request.captureApproved!==true)return {ok:false,code:"forbidden"};
 let session:AssistSession|null;
 try {session=await store.load(request.locationId,request.sessionId);}
 catch {return {ok:false,code:"storage_error"};}
 if(!session)return {ok:false,code:"not_found"};
 if(session.locationId!==request.locationId||session.deviceId!==request.deviceId)return {ok:false,code:"forbidden"};
 if(session.version!==request.expectedVersion)return {ok:false,code:"conflict"};
 const actor:AssistActor={
 id:principal.id,authenticated:true,supportRole:principal.supportRole,
 isCustomerApprover:principal.isCustomerApprover,locationAuthorized:true,deviceAssigned:true
 };
 const decision=decideAssistTransition({session,actor,operation:request.action,now:Date.now(),deviceCaptureApproved:request.captureApproved});
 if(!decision.ok)return {ok:false,code:"forbidden"};
 try {
  const updated=await store.transition({locationId:request.locationId,sessionId:request.sessionId,
   expectedVersion:request.expectedVersion,actorId:principal.id,action:request.action,
   captureApproved:request.captureApproved===true});
  return {ok:true,session:updated};
 } catch {return {ok:false,code:"conflict"};}
}
