#!/usr/bin/env node
/**
 * Read-only, fail-closed 25-50 location certification.
 * Requires real published LI V2 UUIDs for ONE reconciled campaign and the
 * same production credentials used by the single-location E2E. No purchases.
 */
import {spawnSync} from "node:child_process";
const raw=String(process.env.LI_E2E_LOCATION_IDS||"");
const ids=[...new Set(raw.split(/[\s,]+/).map(v=>v.trim()).filter(Boolean))];
if(ids.length<25||ids.length>50)throw Error("Batch certification requires 25 to 50 distinct real location UUIDs");
if(ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))
 throw Error("Invalid LI V2 batch location UUID");
const campaign=String(process.env.LI_E2E_CAMPAIGN_ID||"").trim();
if(!campaign)throw Error("Missing real campaign ID");
const checks=[];
for(const id of ids){
 const execution=spawnSync(process.execPath,["scripts/certify-li-v2-acquisition-search-v3-e2e.mjs"],{
  env:{...process.env,LI_E2E_LOCATION_ID:id},
  encoding:"utf8",timeout:120000,maxBuffer:1024*1024,
 });
 if(execution.status!==0){
  console.error(JSON.stringify({certified:false,campaign_id:campaign,passed:checks.length,
    requested:ids.length,failed_location_id:id,reason:(execution.stderr||"certification_failed").slice(-2000)}));
  process.exit(1);
 }
 const lines=String(execution.stdout||"").trim().split("\n");
 const result=JSON.parse(lines.at(-1));
 if(!result.certified||result.location_id!==id||result.campaign_id!==campaign)
  throw Error("Certification identity mismatch for "+id);
 checks.push(result);
}
console.log(JSON.stringify({certified:true,campaign_id:campaign,locations_certified:checks.length,
 location_ids:checks.map(c=>c.location_id),reconciled_usd:checks.at(-1)?.reconciled_usd,
 unreconciled_count:0}));
