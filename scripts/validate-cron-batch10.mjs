import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");

const batch10 = ["crm-sequence-runner", "search-hf-photo-intelligence"].sort();
const names = (rows) => rows.map((row) => row.name).sort();
const activeNames = new Set(names(schedules));
const stagedNames = new Set(names(staged));
const enabled = new Set(activation.enabled);
const rollback = new Set(activation.rollback_enabled);
const probes = [...activation.probe].sort();
const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch !== 10) throw new Error(`expected batch 10, got ${activation.batch}`);
if (schedules.length !== 34) throw new Error(`expected 34 active schedules, got ${schedules.length}`);
if (activation.enabled.length !== 34) throw new Error(`expected 34 enabled schedules, got ${activation.enabled.length}`);
if (activation.rollback_enabled.length !== 32) throw new Error(`expected rollback baseline 32, got ${activation.rollback_enabled.length}`);
if (staged.length !== 30) throw new Error(`expected 30 staged schedules, got ${staged.length}`);
if (JSON.stringify(delta) !== JSON.stringify(batch10)) throw new Error(`unexpected batch 10 delta: ${delta.join(",")}`);
if (JSON.stringify(probes) !== JSON.stringify(batch10)) throw new Error(`unexpected batch 10 probes: ${probes.join(",")}`);

for (const name of batch10) {
  if (!activeNames.has(name)) throw new Error(`batch 10 schedule missing from active inventory: ${name}`);
  if (!enabled.has(name)) throw new Error(`batch 10 schedule is not enabled: ${name}`);
  if (rollback.has(name)) throw new Error(`batch 10 schedule leaked into rollback baseline: ${name}`);
  if (stagedNames.has(name)) throw new Error(`batch 10 schedule still staged: ${name}`);
}

for (const name of stagedNames) {
  if (activeNames.has(name)) throw new Error(`active/staged overlap: ${name}`);
}

const stillOnVercel = batch10.filter((name) => vercelJobs.has(name));
if (stillOnVercel.length !== 0 && stillOnVercel.length !== batch10.length) {
  throw new Error(`partial Batch 10 Vercel ownership is forbidden: ${stillOnVercel.join(",")}`);
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

console.log(`batch10_scheduler_contract=pass direct_targets=true vercel_transition=${stillOnVercel.length === batch10.length ? "replacement_overlap" : "aws_only"}`);
