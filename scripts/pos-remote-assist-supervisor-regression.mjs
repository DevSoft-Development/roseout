import assert from "node:assert/strict";
import {buildSync} from "esbuild";
import vm from "node:vm";
const entry=new URL("../lib/pos/remote-assist/relay-session-controller.ts",import.meta.url).pathname;
const code=buildSync({entryPoints:[entry],bundle:true,platform:"node",format:"cjs",write:false}).outputFiles[0].text;
const m={exports:{}};
vm.runInNewContext(code,{module:m,exports:m.exports,Promise,Date,Math,Number,Error});
const {superviseRelaySession}=m.exports;
const events=[],timers=new Map();
let next=0,notify;
const scheduler={schedule(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},cancel(id){timers.delete(id);}};
const runtime={
 subscribeSessionState(id,fn){notify=fn;return ()=>events.push("unsub");},
 async disconnectSession(){events.push("disconnect");},
 async revokeTokens(){events.push("revoke");},
 async closeViewerConnections(){events.push("viewer");},
 async stopDevicePublisher(){events.push("publisher");}
};
const grant={sessionState:"active",expiresAt:5000,revokedAt:null,consentExpiresAt:2000,verifiedTechnician:true,deviceAttested:true};
const close=superviseRelaySession({sessionId:"session",runtime,initial:grant,now:()=>1000,onError:e=>{throw e;},scheduler});
assert.equal(timers.size,1);
assert.equal([...timers.values()][0].ms,1000);
notify({...grant,sessionState:"revoked"});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(events[0],"disconnect");
assert.ok(events.includes("revoke"));
assert.ok(events.includes("viewer"));
assert.ok(events.includes("publisher"));
assert.equal(timers.size,0);
close();
console.log("Remote Assist supervisor regression passed");
