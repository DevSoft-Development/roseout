import {describe,it,expect,vi} from "vitest";
import {superviseRelaySession,type AssistRelayRuntime} from "../relay-session-controller";
import type {RelayGrantState} from "../relay-revocation-policy";
const active:RelayGrantState={sessionState:"active",expiresAt:5000,consentExpiresAt:2000,
 revokedAt:null,verifiedTechnician:true,deviceAttested:true};
function harness(){
 let change:(state:RelayGrantState)=>void=()=>{};
 const revokeTokens=vi.fn(async()=>{});
 const closeViewerConnections=vi.fn(async()=>{});
 const stopDevicePublisher=vi.fn(async()=>{});
 const disconnectSession=vi.fn(async()=>{});
 const runtime:AssistRelayRuntime={
  revokeTokens,closeViewerConnections,stopDevicePublisher,disconnectSession,
  subscribeSessionState:(_session,callback)=>{change=callback;return ()=>{};}
 };
 return {runtime,change:(s:RelayGrantState)=>change(s),revokeTokens,closeViewerConnections,stopDevicePublisher};
}
describe("Remote Assist relay shutdown",()=>{
 it("closes both endpoints when consent expires without a revocation event",async()=>{
  vi.useFakeTimers();
  try{
   vi.setSystemTime(1000);
   const h=harness();
   superviseRelaySession({sessionId:"session",runtime:h.runtime,initial:active,now:()=>Date.now(),onError:()=>{}});
   await vi.advanceTimersByTimeAsync(1000);
   expect(h.revokeTokens).toHaveBeenCalledOnce();
   expect(h.closeViewerConnections).toHaveBeenCalledOnce();
   expect(h.stopDevicePublisher).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();}
 });
 it("revocation shuts down before expiry",async()=>{
  vi.useFakeTimers();
  try{
   vi.setSystemTime(1000);
   const h=harness();
   superviseRelaySession({sessionId:"session",runtime:h.runtime,initial:active,now:()=>Date.now(),onError:()=>{}});
   h.change({...active,sessionState:"revoked",revokedAt:1100});
   await vi.runAllTimersAsync();
   expect(h.revokeTokens).toHaveBeenCalledOnce();
   expect(h.stopDevicePublisher).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();}
 });
});
