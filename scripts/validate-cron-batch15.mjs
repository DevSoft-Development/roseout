import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const readText = (path) => fs.readFileSync(path, "utf8");

const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");
const cronConfig = readText("config/cron-jobs.json");
const trackedCron = readText("lib/cron/runTrackedCron.ts");
const domainRoute = readText("app/api/cron/domain-lifecycle/route.ts");
const domainGateway = readText("lib/domains/gateway.ts");
const workerTemplate = readText("infra/aws/cloudformation/worker-runtime.yml");
const workerWorkflow = readText(".github/workflows/aws-worker-runtime.yml");

const job = "domain-lifecycle";
const activeNames = new Set(schedules.map((row) => row.name));
const enabled = new Set(activation.enabled ?? []);
const rollback = new Set(activation.rollback_enabled ?? []);
const stagedNames = new Set(staged.map((row) => row.name));
const activeSorted = [...activeNames].sort();
const enabledSorted = [...enabled].sort();
const rollbackExpected = activeSorted.filter((name) => name !== job).sort();
const rollbackSorted = [...rollback].sort();
const delta = (activation.enabled ?? []).filter((name) => !rollback.has(name)).sort();
const probes = [...(activation.probe ?? [])].sort();
const dryRunProbes = [...(activation.dry_run_probe ?? [])].sort();
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch !== 15) throw new Error(`expected Batch 15, got ${activation.batch}`);
if (schedules.length !== 65) throw new Error(`expected 65 active AWS schedules, got ${schedules.length}`);
if ((activation.enabled ?? []).length !== 65) throw new Error(`expected 65 enabled schedules, got ${(activation.enabled ?? []).length}`);
if ((activation.rollback_enabled ?? []).length !== 64) throw new Error(`expected rollback baseline 64, got ${(activation.rollback_enabled ?? []).length}`);
if (staged.length !== 0) throw new Error(`expected no staged schedules, got ${staged.length}`);
if (JSON.stringify(activeSorted) !== JSON.stringify(enabledSorted)) throw new Error("enabled inventory must exactly equal active schedule inventory");
if (JSON.stringify(rollbackSorted) !== JSON.stringify(rollbackExpected)) throw new Error("rollback baseline must be the exact previous 64-schedule fleet");
if (JSON.stringify(delta) !== JSON.stringify([job])) throw new Error(`unexpected final activation delta: ${delta.join(",")}`);
if (JSON.stringify(probes) !== JSON.stringify([job])) throw new Error(`unexpected live activation probes: ${probes.join(",")}`);
if (JSON.stringify(dryRunProbes) !== JSON.stringify([job])) throw new Error(`unexpected dry-run probes: ${dryRunProbes.join(",")}`);
if (stagedNames.has(job)) throw new Error("domain-lifecycle must not remain staged");
if (rollback.has(job)) throw new Error("domain-lifecycle leaked into rollback baseline");

const row = schedules.find((item) => item.name === job);
if (!row) throw new Error("domain-lifecycle schedule missing");
if (row.expression !== "cron(0/5 * * * ? *)") throw new Error("domain-lifecycle cadence drifted");
if (row.function !== "sqs:background-cron") throw new Error("domain-lifecycle must use the shared durable background queue");
if (row.body?.target !== "/api/cron/managed?job=domain-lifecycle") throw new Error("domain-lifecycle durable target drifted");
if (JSON.stringify(Object.keys(row.body ?? {}).sort()) !== JSON.stringify(["target"])) throw new Error("domain-lifecycle schedule body must contain target only");

if (![0, 1].includes(vercelJobs.size)) throw new Error(`expected zero or one Vercel cron during final cutover, got ${vercelJobs.size}`);
for (const name of vercelJobs) if (name !== job) throw new Error(`unexpected Vercel cron during final cutover: ${name}`);

for (const required of ["claimExecutionLease", "duplicate_inflight", "DEFAULT_CRON_LEASE_MS", "last_started_at", "stale_execution_lease_recovered"]) {
  if (!trackedCron.includes(required)) throw new Error(`cross-runtime execution lease contract missing: ${required}`);
}
for (const required of ["registrarLifecycleOwnedByAws", "reconcileRegistrations", "processEligibleRenewals", "connectGeneratedSiteDomain", 'registrar_lifecycle_owner: registrarOwnedByAws ? "aws" : "vercel"']) {
  if (!domainRoute.includes(required)) throw new Error(`domain lifecycle behavior contract missing: ${required}`);
}
for (const required of ["DOMAIN_GATEWAY_URL", "DOMAIN_GATEWAY_SECRET", "getDomainGatewayStatus", "x-idempotency-key"]) {
  if (!domainGateway.includes(required)) throw new Error(`domain gateway contract missing: ${required}`);
}
if (!cronConfig.includes('{"jobKey":"domain-lifecycle","jobName":"Domain Lifecycle","targetPath":"/api/cron/domain-lifecycle","delivery":"managed"')) {
  throw new Error("domain-lifecycle must remain a managed tracked cron");
}
if (!workerTemplate.includes("EnableDomainLifecycleSchedule:") || !workerTemplate.includes("Default: 'false'")) {
  throw new Error("dedicated registrar worker must remain disabled by default");
}
if (!workerWorkflow.includes("enable_domain_lifecycle:") || !workerWorkflow.includes("default: false")) {
  throw new Error("dedicated registrar worker deployment toggle must remain disabled by default");
}

console.log(`batch15_scheduler_contract=pass active=65 rollback=64 vercel_overlap=${vercelJobs.size} live_probe=1 dry_run_probe=1`);
