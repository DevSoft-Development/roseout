import {relayPermitted,type RelayGrantState,type RelayShutdown,shutdownRemoteAssist} from "./relay-revocation-policy";
export interface AssistRelayRuntime extends RelayShutdown {
 subscribeSessionState(sessionId:string,onChange:(grant:RelayGrantState)=>void):()=>void;
 disconnectSession(sessionId:string):Promise<void>;
}
export interface RelayScheduler {
 schedule(callback:()=>void,delayMs:number):unknown;
 cancel(handle:unknown):void;
}
/** Server runtime supplies a real scheduler. No remote input channel is exposed. */
export function superviseRelaySession(input:{
 sessionId:string;runtime:AssistRelayRuntime;initial:RelayGrantState;
 now:()=>number;onError:(error:unknown)=>void;scheduler:RelayScheduler;
}):()=>void{
 let closed=false;
 let stopping=false;
 let timer:unknown;
 const stop=async()=>{
  if(stopping)return;
  stopping=true;
  if(timer!==undefined){input.scheduler.cancel(timer);timer=undefined;}
  // Disconnect immediately before asynchronous token and publisher cleanup.
  try{await input.runtime.disconnectSession(input.sessionId);}catch(error){input.onError(error);}
  try{await shutdownRemoteAssist(input.sessionId,input.runtime);}catch(error){input.onError(error);}
 };
 const check=(grant:RelayGrantState)=>{
  if(closed||stopping)return;
  if(timer!==undefined){input.scheduler.cancel(timer);timer=undefined;}
  const now=input.now();
  if(!relayPermitted(grant,now)){void stop();return;}
  const delay=Math.min(grant.expiresAt,grant.consentExpiresAt)-now;
  // Explicit expiry timer: never rely solely on database notifications.
  if(!Number.isFinite(delay)||delay<=0){void stop();return;}
  timer=input.scheduler.schedule(()=>{timer=undefined;void stop();},Math.max(1,Math.ceil(delay)));
 };
 const unsubscribe=input.runtime.subscribeSessionState(input.sessionId,check);
 check(input.initial);
 return ()=>{closed=true;unsubscribe();void stop();};
}
