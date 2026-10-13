import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {transformSync} from "esbuild";
const src=readFileSync(new URL("../lib/pos/remote-assist/relay-policy.ts",import.meta.url),"utf8");
const cjsModule={exports:{}};
vm.runInNewContext(transformSync(src,{loader:"ts",format:"cjs",target:"node20"}).code,{module:cjsModule,exports:cjsModule.exports,Date,Number,Object});
const {authorizeRelayGrant,validatePointerAnnotation}=cjsModule.exports;
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"];
const now=Date.parse("2026-10-13T10:00:00Z");
const session={id:ids[0],locationId:ids[1],deviceId:ids[2],state:"active",version:4,approvedBy:ids[4],endedAt:null,consentExpiresAt:new Date(now+600000).toISOString()};
const grant={sessionId:ids[0],locationId:ids[1],deviceId:ids[2],principalId:ids[3],role:"viewer",channels:["signaling","pointer"],issuedAt:now,expiresAt:now+30000,sessionVersion:4};
const input={grant,session,principalId:ids[3],role:"viewer",channel:"pointer",locationPermission:true,deviceAssigned:true,now};
assert.equal(authorizeRelayGrant(input),true);
for(const bad of [{locationPermission:false},{deviceAssigned:false},{principalId:ids[4]},{role:"device"},{now:now+30001},{grant:{...grant,locationId:ids[4]}},{grant:{...grant,sessionVersion:3}},{grant:{...grant,expiresAt:now+61000}},{session:{...session,state:"revoked"}},{session:{...session,endedAt:new Date(now).toISOString()}}]){
 assert.equal(authorizeRelayGrant({...input,...bad}),false);
}
assert.equal(validatePointerAnnotation({x:0.5,y:1,kind:"pointer",sequence:1}),true);
assert.equal(validatePointerAnnotation({x:1.1,y:0,kind:"pointer",sequence:1}),false);
assert.equal(validatePointerAnnotation({x:0,y:0,kind:"click",sequence:1}),false);
console.log("Remote Assist relay policy regression passed");
