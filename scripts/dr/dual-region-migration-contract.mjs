import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const migrationWorkflowPath = ".github/workflows/supabase-dual-region-migrations.yml";
const healthWorkflowPath = ".github/workflows/production-dr-health-gate.yml";
const webWorkflowPath = ".github/workflows/aws-web-surfaces-services.yml";
const reserveWebWorkflowPath = ".github/workflows/aws-reserve-web.yml";
const reserveApiWorkflowPath = ".github/workflows/aws-reserve-api.yml";
const healthScriptPath = "scripts/dr/require-production-dr-healthy.sh";
const recoverableScriptPath = "scripts/dr/require-production-dr-recoverable.sh";

for (const file of [migrationWorkflowPath, healthWorkflowPath, webWorkflowPath, reserveWebWorkflowPath, reserveApiWorkflowPath, healthScriptPath, recoverableScriptPath]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing DR/migration contract file: ${file}`);
}

const migrationWorkflow = read(migrationWorkflowPath);
for (const marker of [
  "Validate migrations against both regions",
  "Apply migrations Oregon then Virginia",
  "Require healthy starting DR state",
  "Require recoverable DR topology before safe auto-repair",
  "Require healthy DR after migration",
  "toh_dual_region_migration_ledger",
  "alter subscription $EXPECTED_SUBSCRIPTION refresh publication",
]) {
  if (!migrationWorkflow.includes(marker)) throw new Error(`Dual-region migration workflow missing marker: ${marker}`);
}

const oregonApply = migrationWorkflow.indexOf('apply_one "$OREGON_REF"');
const virginiaApply = migrationWorkflow.indexOf('apply_one "$VIRGINIA_REF"');
if (oregonApply < 0 || virginiaApply < 0 || oregonApply > virginiaApply) {
  throw new Error("Dual-region migration deployment must apply Oregon-compatible DDL before Virginia.");
}

const healthScript = read(healthScriptPath);
const recoverableScript = read(recoverableScriptPath);
if (!recoverableScript.includes('wal_status != "lost"') || !recoverableScript.includes("protected recovery is required")) {
  throw new Error("Safe migration auto-repair must refuse lost-slot/destructive recovery states.");
}
for (const marker of [
  "writable-catalog.sql",
  "active_slots == 1",
  "enabled_subscriptions == 1",
  "connected_workers >= 1",
  "pending_tables == 0",
  "active_cron_jobs == 0",
  "wal_status != \"lost\"",
]) {
  if (!healthScript.includes(marker)) throw new Error(`Production DR health gate missing invariant: ${marker}`);
}

for (const deploymentWorkflowPath of [webWorkflowPath, reserveWebWorkflowPath, reserveApiWorkflowPath]) {
  const deploymentWorkflow = read(deploymentWorkflowPath);
  if (!deploymentWorkflow.includes("Require healthy production DR before deployment") ||
      !deploymentWorkflow.includes("bash scripts/dr/require-production-dr-healthy.sh")) {
    throw new Error(`${deploymentWorkflowPath} must fail closed on unhealthy production DR.`);
  }
}

const workflowsDir = path.join(root, ".github/workflows");
for (const entry of fs.readdirSync(workflowsDir)) {
  if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
  if (entry === "supabase-dual-region-migrations.yml") continue;
  const source = fs.readFileSync(path.join(workflowsDir, entry), "utf8");
  const ownsMigrationFiles = source.includes("supabase/migrations") &&
    (source.includes("database/query") || source.includes("supabase db push"));
  const primaryOnly = source.includes("VIRGINIA_REF") && !source.includes("OREGON_REF");
  if (ownsMigrationFiles && primaryOnly) {
    throw new Error(`${entry} appears to mutate migration SQL against Virginia without Oregon. All normal migrations must use the dual-region pipeline.`);
  }
}

console.log("Dual-region migration and DR deploy contracts are enforced.");
