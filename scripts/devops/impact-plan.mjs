#!/usr/bin/env node
// Fail-closed change impact classifier for the Azure DevOps migration.
// Output is intentionally a plan, not permission to deploy.
import {execFileSync} from "node:child_process";
const base=process.env.CI_BASE_SHA;
const head=process.env.CI_HEAD_SHA||"HEAD";
const all=["admin","business","reserve","pos","consumer","mobile","background","infrastructure"];
if(!base){console.log(JSON.stringify({scope:"full",affected:all,reason:"missing_base_sha"}));process.exit(0);}
let files;
try{files=execFileSync("git",["diff","--name-only",base,head],{encoding:"utf8"}).split("\n").filter(Boolean);}
catch{console.log(JSON.stringify({scope:"full",affected:all,reason:"unresolved_diff"}));process.exit(0);}
const affected=new Set();
let full=false;
for(const f of files){
  if(/^(package(-lock)?\.json|tsconfig\.json|next\.config\.ts|proxy\.ts|packages\/)/.test(f)){full=true;continue;}
  if(/^apps\/admin\/|^app\/admin\//.test(f))affected.add("admin");
  else if(/^apps\/business\/|^app\/business\//.test(f))affected.add("business");
  else if(/^apps\/reserve\/|^app\/api\/reserve\//.test(f))affected.add("reserve");
  else if(/^pos-mobile\/|^apps\/pos\//.test(f))affected.add("pos");
  else if(/^apps\/consumer\/|^app\/(?!api\/cron\/)/.test(f))affected.add("consumer");
  else if(/^mobile\/|^azure-pipelines-mobile\.yml$/.test(f))affected.add("mobile");
  else if(/^lib\/location-intelligence\/|^app\/api\/cron\/|^infra\/aws\/edge-runtime\//.test(f))affected.add("background");
  else if(/^infra\/|^supabase\/migrations\//.test(f))affected.add("infrastructure");
  else if(/^lib\/|^components\/|^public\/|^config\//.test(f)){full=true;}
  else if(/^docs\/|\.md$/.test(f)){} // documentation only
  else full=true; // unknown input cannot silently skip validation
}
const list=full?all:all.filter(x=>affected.has(x));
console.log(JSON.stringify({scope:full?"full":list.length?"affected":"none",affected:list,files,reason:full?"shared_or_unknown_input":"changed_files"}));
