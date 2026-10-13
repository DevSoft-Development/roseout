import type {AssistSessionStore,AssistTrustedPrincipal,AssistTransitionRequest,AssistTransitionResult} from "./server-transition-boundary";
import {transitionAssistSession} from "./server-transition-boundary";

/** Activation proof MUST be consumed inside the same database transaction as the state transition. */
export type AtomicActivationStore=AssistSessionStore & {
 activateWithVerification(args:{
  locationId:string;sessionId:string;deviceId:string;technicianId:string;
  expectedVersion:number;nativeCaptureApproved:true;
 }):Promise<import("./session-policy").AssistSession>;
};
/** This function never falls back to the legacy activation transition, which lacks code verification. */
export async function transitionVerifiedAssistSession(
 principal:AssistTrustedPrincipal,request:AssistTransitionRequest,store:AtomicActivationStore
):Promise<AssistTransitionResult>{
 if(request.action!=="activate")return transitionAssistSession(principal,request,store);
 if(!principal.authenticated||!principal.supportRole)return {ok:false,code:"forbidden"};
 if(!principal.locationIds.includes(request.locationId)||!principal.assignedDeviceIds.includes(request.deviceId))
  return {ok:false,code:"forbidden"};
 if(![principal.id,request.locationId,request.sessionId,request.deviceId].every(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x))||
  !Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<1)return {ok:false,code:"invalid_request"};
 try{
  const session=await store.load(request.locationId,request.sessionId);
  if(!session)return {ok:false,code:"not_found"};
  if(session.locationId!==request.locationId||session.deviceId!==request.deviceId)return {ok:false,code:"forbidden"};
  if(session.version!==request.expectedVersion)return {ok:false,code:"conflict"};
  if(session.state!=="approved")return {ok:false,code:"forbidden"};
  const capture=await store.verifyNativeCapture({locationId:request.locationId,deviceId:request.deviceId,sessionId:request.sessionId});
  if(!capture)return {ok:false,code:"forbidden"};
  const updated=await store.activateWithVerification({
   locationId:request.locationId,sessionId:request.sessionId,deviceId:request.deviceId,
   technicianId:principal.id,expectedVersion:request.expectedVersion,nativeCaptureApproved:true
  });
  return {ok:true,session:updated};
 }catch{return {ok:false,code:"conflict"};}
}
