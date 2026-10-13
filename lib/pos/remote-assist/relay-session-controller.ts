import {relayPermitted,type RelayGrantState,type RelayShutdown,shutdownRemoteAssist} from "./relay-revocation-policy";
export interface AssistRelayRuntime extends RelayShutdown {
 subscribeSessionState(sessionId:string,onChange:(grant:RelayGrantState)=>void):()=>void;
 disconnectSession(sessionId:string):Promise<void>;
}
/** Fail closed when grant becomes invalid. Stop both publisher and viewer.
 * Subscription is established before initial evaluation to avoid a missed revocation.
 * A relay must ALSO validate grants independently on connection and expiry;
 * callback supervision alone cannot enforce an expiry deadline.
 */
export function superviseRelaySession(input:{
 sessionId:string;runtime:AssistRelayRuntime;initial:RelayGrantState;
 now:()=>number;onError:(error:unknown)=>void;
}):()=>void{
 let closed=false;
 let stopping=false;
 const stop=async()=>{
  if(stopping)return;
  stopping=true;
  try{await shutdownRemoteAssist(input.sessionId,input.runtime);}
  catch(error){input.onError(error);}
  finally{try{await input.runtime.disconnectSession(input.sessionId);}catch(error){input.onError(error);}}
 };
 const check=(grant:RelayGrantState)=>{
  if(closed)return;
  if(!relayPermitted(grant,input.now()))void stop();
 };
 const unsubscribe=input.runtime.subscribeSessionState(input.sessionId,check);
 check(input.initial);
 return ()=>{closed=true;unsubscribe();void stop();};
}
