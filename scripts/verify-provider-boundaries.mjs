import fs from "node:fs";
import path from "node:path";

const roots = ["app", "lib", "supabase/functions"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".mts"]);
const violations = [];

const forbiddenRuntimeHosts = [
  ["api.openai.com", "OpenAI must run through the AWS Assistant API"],
  ["api.telnyx.com", "Telnyx must run through the AWS Integration API"],
];

function visit(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
    return;
  }
  if (!extensions.has(path.extname(target))) return;
  if (/(__tests__|\.test\.|\.spec\.)/.test(target)) return;
  const source = fs.readFileSync(target, "utf8");
  for (const [needle, reason] of forbiddenRuntimeHosts) {
    if (source.includes(needle)) violations.push(`${target}: ${reason} (${needle})`);
  }
}

for (const root of roots) visit(root);

const edgeWorkflow = fs.readFileSync(".github/workflows/aws-edge-runtime.yml", "utf8");
if (edgeWorkflow.includes("TELNYX_TRANSACTIONAL_API_KEY: ${{ secrets.TELNYX_TRANSACTIONAL_API_KEY }}")) {
  violations.push(".github/workflows/aws-edge-runtime.yml: direct Telnyx provider credentials must not be injected into Edge");
}

if (violations.length) {
  console.error("Provider boundary verification failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Provider boundary verification passed for OpenAI/Telnyx runtime egress.");
