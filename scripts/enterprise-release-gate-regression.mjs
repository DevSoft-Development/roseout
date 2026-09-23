import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const pkg = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/production-ci.yml");
const browserWorkflow = read(".github/workflows/production-browser-verification.yml");

const scripts = pkg.scripts || {};
for (const key of [
  "test:canonical-attribution",
  "test:private-events",
  "test:enterprise-reservations",
  "test:growth-intelligence",
  "test:crm-customer-timeline",
  "test:surface-app-isolation",
  "test:security-access",
  "test:enterprise-business",
  "test:enterprise-release",
]) {
  if (!scripts[key]) throw new Error(`Missing required release script: ${key}`);
}

for (const required of [
  "test:canonical-attribution",
  "test:private-events",
  "test:enterprise-reservations",
  "test:growth-intelligence",
  "test:crm-customer-timeline",
]) {
  requireText(scripts["test:enterprise-business"], required, `Enterprise business suite must run ${required}.`);
}

for (const required of [
  "test:security-access",
  "test:surface-app-isolation",
  "test:enterprise-business",
  "test:release-gate-closure",
]) {
  requireText(scripts["test:enterprise-release"], required, `Enterprise release suite must run ${required}.`);
}

requireText(scripts["production-check:strict"], "test:enterprise-release", "Strict production validation must include the enterprise release suite.");
requireText(workflow, "business_revenue", "Production CI must detect business/revenue changes.");
requireText(workflow, "Enterprise business and revenue regressions", "Production CI must expose a dedicated enterprise revenue lane.");
requireText(workflow, "npm run test:enterprise-business", "Production CI must execute the enterprise business suite.");
requireText(workflow, "lib/(analytics/(location-roi|growth-intelligence)|marketing/(canonical-attribution|location-demand-insights)|leads/)", "Revenue lane must own canonical analytics, attribution, demand, and lead changes.");
requireText(workflow, "apps/business/app/locations/dashboard/(analytics|marketing-studio|event-leads|catering)/", "Revenue lane must own Business growth workspaces.");
requireText(workflow, "apps/reserve/app/api/(reserve/|v1/reserve/)", "Revenue lane must cover isolated Reserve API changes.");
requireText(workflow, "crm/customer-journey", "Revenue lane must cover canonical CRM customer journey changes.");
requireText(workflow, "apps/(consumer|admin|business|reserve)/", "Required browser smoke detection must cover all four app surfaces.");
for (const surface of ["consumer", "admin", "business", "reserve"]) {
  requireText(browserWorkflow, `apps/${surface}/**`, `Production browser verification must trigger for ${surface} app changes.`);
}

console.log("Enterprise cross-surface release gate closure checks passed.");
