import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");

const batch10 = ["crm-sequence-runner", "search-hf-photo-intelligence"].sort();
const activeNames = new Set(schedules.map((row) => row.name));
const stagedNames = new Set(staged.map((row) => row.name));
const enabled = new Set(activation.enabled);
const rollback = new Set(activation.rollback_enabled);
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch < 10) throw new Error(`activation regressed below Batch 10: ${activation.batch}`);
if (schedules.length < 34) throw new Error(`active schedule inventory regressed below 34: ${schedules.length}`);
if (activation.enabled.length < 34) throw new Error(`enabled schedule inventory regressed below 34: ${activation.enabled.length}`);

for (const name of batch10) {
  if (!activeNames.has(name)) throw new Error(`Batch 10 schedule missing from active inventory: ${name}`);
  if (!enabled.has(name)) throw new Error(`Batch 10 schedule is not enabled: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 10 schedule returned to staged inventory: ${name}`);
  if (vercelJobs.has(name)) throw new Error(`Batch 10 schedule returned to Vercel ownership: ${name}`);
  if (activation.batch === 10 && rollback.has(name)) throw new Error(`Batch 10 schedule leaked into its rollback baseline: ${name}`);
}

if (activation.batch === 10) {
  const probes = [...activation.probe].sort();
  const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
  if (schedules.length !== 34) throw new Error(`expected 34 active schedules in Batch 10, got ${schedules.length}`);
  if (activation.enabled.length !== 34) throw new Error(`expected 34 enabled schedules in Batch 10, got ${activation.enabled.length}`);
  if (activation.rollback_enabled.length !== 32) throw new Error(`expected Batch 10 rollback baseline 32, got ${activation.rollback_enabled.length}`);
  if (staged.length !== 30) throw new Error(`expected 30 staged schedules in Batch 10, got ${staged.length}`);
  if (JSON.stringify(delta) !== JSON.stringify(batch10)) throw new Error(`unexpected Batch 10 delta: ${delta.join(",")}`);
  if (JSON.stringify(probes) !== JSON.stringify(batch10)) throw new Error(`unexpected Batch 10 probes: ${probes.join(",")}`);
}

const previousAwsOwned = [
  "search-ml-learning-maintenance",
  "location-search-profile-worker",
  "catalog-enrichment-runner",
  "location-description-backfill",
  "search-phase13-maintenance",
  "search-hf-inventory-maintenance",
  "website-replica-repair",
  "cron-alert-dispatcher",
];
for (const name of previousAwsOwned) {
  if (vercelJobs.has(name)) throw new Error(`previous AWS-owned job returned to Vercel: ${name}`);
}

const crm = schedules.find((row) => row.name === "crm-sequence-runner");
if (crm?.expression !== "cron(0/5 * * * ? *)" || crm?.function !== "node:/api/cron/crm-sequence-runner" || Object.keys(crm?.body ?? {}).length !== 0) {
  throw new Error("CRM sequence runner Batch 10 direct target/cadence drifted");
}
const hf = schedules.find((row) => row.name === "search-hf-photo-intelligence");
if (hf?.expression !== "cron(0/10 * * * ? *)" || hf?.function !== "node:/api/cron/search-hf-photo-intelligence" || Object.keys(hf?.body ?? {}).length !== 0) {
  throw new Error("HF photo intelligence Batch 10 direct target/cadence drifted");
}

console.log(`batch10_scheduler_contract=pass activation_batch=${activation.batch} aws_only=true`);
