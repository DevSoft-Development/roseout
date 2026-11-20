import {describe,it,expect} from "vitest";
import {issueTextToPayChallenge,hashTextToPayToken,matchTextToPayToken} from "../../lib/pos/payments/text-to-pay-session";
const id="642a2ad6-c144-47b7-b9ff-f89554edf0da";
const now=Date.UTC(2026,9,14);
const base={locationId:id,checkId:id,tenderId:id,amountCents:285000,currency:"usd",agreementSha256:"a".repeat(64),expiresAt:new Date(now+600000).toISOString()};
describe("Text-to-Pay session cryptographic boundaries",()=>{
 it("issues opaque unique 256-bit tokens; stores only a hash",()=>{
  const a=issueTextToPayChallenge(base,now),b=issueTextToPayChallenge(base,now);
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a.token).not.toEqual(b.token);
  expect(a.tokenHash).toBe(hashTextToPayToken(a.token));
  expect(a.tokenHash).not.toEqual(b.tokenHash);
  expect(matchTextToPayToken(a.token,a.tokenHash)).toBe(true);
  expect(matchTextToPayToken(b.token,a.tokenHash)).toBe(false);
 });
 it("rejects stale, overlong and tampered snapshots",()=>{
  expect(()=>issueTextToPayChallenge({...base,expiresAt:new Date(now).toISOString()},now)).toThrow();
  expect(()=>issueTextToPayChallenge({...base,expiresAt:new Date(now+600001).toISOString()},now)).toThrow();
  expect(()=>issueTextToPayChallenge({...base,amountCents:0},now)).toThrow();
  expect(()=>issueTextToPayChallenge({...base,agreementSha256:"bad"},now)).toThrow();
  expect(()=>hashTextToPayToken("invalid")).toThrow();
 });
});
