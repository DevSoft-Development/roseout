import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {transformSync} from "esbuild";
const src=readFileSync(new URL("../lib/pos/remote-assist/capabilities.ts",import.meta.url),"utf8");
const cjsModule={exports:{}};
vm.runInNewContext(transformSync(src,{loader:"ts",format:"cjs",target:"node20"}).code,{module:cjsModule,exports:cjsModule.exports,Date,Number,Object});
const {assistActionsFor,mayAssist,redactAssistTelemetry}=cjsModule.exports;
const now=Date.parse("2026-10-12T12:00:00Z"), expiresAt=new Date(now+600000).toISOString();
for(const platform of ["android","ipados","linux"]){
 const base={platform,authorized:true,assigned:true,state:"active",expiresAt,now};
 assert.equal(mayAssist({...base,action:"screen_share"}),true);
 assert.equal(mayAssist({...base,action:"remote_touch"}),false);
 assert.equal(mayAssist({...base,action:"reboot"}),false);
 assert.equal(mayAssist({...base,action:"screen_share",authorized:false}),false);
 assert.equal(mayAssist({...base,action:"screen_share",assigned:false}),false);
 assert.equal(mayAssist({...base,action:"screen_share",expiresAt:null}),false);
 assert.equal(mayAssist({...base,action:"screen_share",state:"revoked"}),false);
 assert.equal(mayAssist({...base,action:"screen_share",now:now+601000}),false);
 assert.ok(assistActionsFor(platform).includes("diagnostics"));
 assert.equal(mayAssist({...base,platform:"ios",action:"screen_share"}),false);
}
assert.equal(redactAssistTelemetry({details:{cardNumber:"1234",status:"ok"}}).details.cardNumber,"[REDACTED]");
console.log("Remote Assist policy regression passed");
