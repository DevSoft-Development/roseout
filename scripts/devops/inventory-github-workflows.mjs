#!/usr/bin/env node
// Read-only, deterministic migration inventory. No credentials and no side effects.
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {join,basename} from "node:path";
const root=process.cwd();
const directory=join(root,".github","workflows");
const workflows=readdirSync(directory).filter(f=>/\.ya?ml$/i.test(f)).sort();
const tags=[
 ["mobile",/mobile|ota|expo|native/i],
 ["disaster-recovery",/\bdr\b|oregon|restore|backup|replication|failback/i],
 ["pos",/pos|shift|payment|stripe/i],
 ["li-search",/li-v2|location|search|enrichment|geocod/i],
 ["azure",/azure|consumer|frontdoor/i],
 ["aws",/aws|edge-runtime|cron|scheduler/i],
 ["database",/supabase|shard|schema|postgres/i],
 ["security",/security|auth|credential|secret|audit/i]
];
function match(text,pattern){return pattern.test(text)}
function triggerBlock(src){
 const m=src.match(/^(?:on|['"]on['"]):\s*(.*)$/m);
 return m?m[1].trim():"not_identified";
}
const entries=workflows.map(file=>{
 const path=".github/workflows/"+file;
 const content=readFileSync(join(directory,file),"utf8");
 const text=file+"\n"+content;
 const categories=tags.filter(([_,re])=>match(text,re)).map(([name])=>name);
 const lower=content.toLowerCase();
 return {path,name:(content.match(/^name:\s*(.+)$/m)||[])[1]?.trim()||basename(file),
  categories,triggerDeclaration:triggerBlock(content),
  scheduled:/^\s*schedule\s*:/m.test(content),
  manual:/workflow_dispatch/.test(content),
  reusable:/workflow_call/.test(content),
  productionSensitive:/environment:\s*.*prod|deploy|rollback|destroy|failback|production/i.test(text),
  azurePipeline:"unmapped",status:"requires_review"};
});
const out=join(root,"artifacts","devops");mkdirSync(out,{recursive:true});
writeFileSync(join(out,"github-workflow-inventory.json"),JSON.stringify({generatedAt:null,total:entries.length,entries},null,2)+"\n");
const lines=["# GitHub Actions to Azure Pipelines inventory","",
 "Total workflow files: "+entries.length,"",
 "| Workflow | Categories | Schedule | Manual | Production-sensitive | Azure mapping |",
 "|---|---|---|---|---|---|"];
for(const e of entries)lines.push("| "+e.path+" | "+(e.categories.join(", ")||"general")+" | "+e.scheduled+" | "+e.manual+" | "+e.productionSensitive+" | "+e.azurePipeline+" |");
lines.push("","## Migration acceptance","",
"- Review each workflow for active runtime use, secrets, triggers, environment approvals, and rollback behavior.",
"- Assign Azure pipeline mapping or explicitly mark obsolete with evidence.",
"- Confirm the last successful execution and matching Azure run for required workflows.",
"- Retain GitHub synchronization and deployment paths until production and DR parity are certified.");
writeFileSync(join(out,"github-workflow-inventory.md"),lines.join("\n")+"\n");
console.log(JSON.stringify({total:entries.length,json:"artifacts/devops/github-workflow-inventory.json",markdown:"artifacts/devops/github-workflow-inventory.md"}));
