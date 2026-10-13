import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {transformSync} from "esbuild";
const source=readFileSync(new URL("../lib/pos/remote-assist/relay-revocation-policy.ts",import.meta.url),"utf8");
const m={exports:{}};
vm.runInNewContext(transformSync(source,{loader:"ts",format:"cjs",target:"node20"}).code,{module:m,exports:m.exports,Promise,Error});
const {relayPermitted,shutdownRemoteAssist}=m.exports;
const valid={sessionState:"active",expiresAt:2000,revokedAt:null,consentExpiresAt:1800,verifiedTechnician:true,deviceAttested:true};
assert.equal(relayPermitted(valid,1000),true);
for(const state of [{...valid,sessionState:"revoked"},{...valid,revokedAt:900},{...valid,verifiedTechnician:false},{...valid,deviceAttested:false}]){
 assert.equal(relayPermitted(state,1000),false);
}
assert.equal(relayPermitted(valid,1800),false);
const events=[];
await shutdownRemoteAssist("session",{async revokeTokens(){events.push("tokens");},async closeViewerConnections(){events.push("viewers");},async stopDevicePublisher(){events.push("publisher");}});
assert.deepEqual(events.sort(),["publisher","tokens","viewers"]);
await assert.rejects(()=>shutdownRemoteAssist("session",{async revokeTokens(){throw Error("failed");},async closeViewerConnections(){},async stopDevicePublisher(){}}),/relay_shutdown_incomplete/);
console.log("Remote Assist relay revocation regression passed");
