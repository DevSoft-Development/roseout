import {describe,it,expect,vi} from "vitest";
import {createHmac} from "node:crypto";
import {redeemAuthorizedCode} from "../trusted-code-command";
import {relayPermitted} from "../relay-revocation-policy";
import {certifiedForRollout} from "../native-capture-certification";
import type {AssistAuthenticatedIdentity,AssistPrivilegedDatabase} from "../trusted-database-port";

const ids={
 sessionId:"10000000-0000-4000-8000-000000000001",
 locationId:"10000000-0000-4000-8000-000000000002",
 deviceId:"10000000-0000-4000-8000-000000000003",
 technicianId:"10000000-0000-4000-8000-000000000004"
};
const secret="test-only-secret-with-at-least-32-characters";
const identity:AssistAuthenticatedIdentity={
 resolveTechnician:async()=>({id:ids.technicianId,locationIds:[ids.locationId],deviceIds:[ids.deviceId]}),
 resolveDevice:async()=>null
};
function db(redeem:AssistPrivilegedDatabase["redeemCodeAndCreateProof"]):AssistPrivilegedDatabase{
 return {redeemCodeAndCreateProof:redeem,activateWithProofs:async()=>false,
 recordCaptureAttestation:async()=>{},revokeAndTerminate:async()=>{}};
}
describe("POS support fail-closed boundaries",()=>{
 it("derives HMAC server-side from six digits and authenticated technician",async()=>{
  const redeem=vi.fn(async()=> "accepted" as const);
  const result=await redeemAuthorizedCode({identity,db:db(redeem),scope:ids,code:"004219",secret});
  expect(result).toEqual({ok:true});
  expect(redeem).toHaveBeenCalledWith(ids,createHmac("sha256",secret)
   .update([ids.sessionId,ids.locationId,ids.deviceId,ids.technicianId,"004219"].join(":")).digest("hex"));
 });
 it("rejects digest injection and unauthorized technician before DB access",async()=>{
  const redeem=vi.fn(async()=> "accepted" as const);
  const injected=await redeemAuthorizedCode({identity,db:db(redeem),scope:ids,code:"a".repeat(64),secret});
  expect(injected.ok).toBe(false);
  const unauthorized:AssistAuthenticatedIdentity={...identity,resolveTechnician:async()=>null};
  expect((await redeemAuthorizedCode({identity:unauthorized,db:db(redeem),scope:ids,code:"123456",secret})).ok).toBe(false);
  expect(redeem).not.toHaveBeenCalled();
 });
 it("rejects revoked relay grants",()=>{
  expect(relayPermitted({sessionState:"active",expiresAt:200,revokedAt:1,consentExpiresAt:200,
   verifiedTechnician:true,deviceAttested:true},100)).toBe(false);
 });
 it("rejects capture certification without physical device evidence",()=>{
  expect(certifiedForRollout({platform:"android",nativeConsent:true,deviceAuthenticated:true,
   sessionBound:true,revocationStopsCapture:true,noRemoteInput:true,
   captureTransportEncrypted:true,testedOnPhysicalDevice:false})).toBe(false);
 });
});
