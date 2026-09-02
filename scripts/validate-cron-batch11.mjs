import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");

const batch11a = [
  "backfill-review-counts",
  "semantic-nightly",
  "search-ml-training-dataset",
  "search-anchor-reconciliation",
  "search-anchor-history-cleanup",
  "ml-recalculate-phase2",
].sort();

const batch11b = [
  "health-intelligence",
  "nightly-search-profile-queue",
  "ml-recalculate-advanced-all",
  "ml-recalculate-review-intelligence",
  "search-phase4b-evaluation",
].sort();

const expected = new Map([
  ["backfill-review-counts", "cron(20 5 * * ? *)"],
  ["semantic-nightly", "cron(40 5 * * ? *)"],
  ["search-ml-training-dataset", "cron(40 7 * * ? *)"],
  ["search-anchor-reconciliation", "cron(40 6 * * ? *)"],
  ["search-anchor-history-cleanup", "cron(0 7 ? * SUN *)"],
  ["ml-recalculate-phase2", "cron(30 8 * * ? *)"],
  ["health-intelligence", "cron(15 7 * * ? *)"],
  ["nightly-search-profile-queue", "cron(45 7 * * ? *)"],
  ["ml-recalculate-advanced-all", "cron(55 8 * * ? *)"],
  ["ml-recalculate-review-intelligence", "cron(15 8 * * ? *)"],
  ["search-phase4b-evaluation", "cron(0 9 ? * MON *)"],
]);

const activeNames = new Set(schedules.map((row) => row.name));
const stagedNames = new Set(staged.map((row) => row.name));
const enabled = new Set(activation.enabled);
const rollback = new Set(activation.rollback_enabled);
const probes = [...activation.probe].sort();
const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch !== 11) throw new Error(`expected Batch 11, got ${activation.batch}`);
if (schedules.length !== 45) throw new Error(`expected 45 active schedules, got ${schedules.length}`);
if (activation.enabled.length !== 45) throw new Error(`expected 45 enabled schedules, got ${activation.enabled.length}`);
if (activation.rollback_enabled.length !== 40) throw new Error(`expected rollback baseline 40, got ${activation.rollback_enabled.length}`);
if (staged.length !== 19) throw new Error(`expected 19 staged schedules, got ${staged.length}`);
if (JSON.stringify(delta) !== JSON.stringify(batch11b)) throw new Error(`unexpected Batch 11B delta: ${delta.join(",")}`);
if (JSON.stringify(probes) !== JSON.stringify(batch11b)) throw new Error(`unexpected Batch 11B probes: ${probes.join(",")}`);

for (const name of batch11a) {
  if (!activeNames.has(name) || !enabled.has(name) || !rollback.has(name)) {
    throw new Error(`Batch 11A baseline ownership regressed: ${name}`);
  }
  if (stagedNames.has(name) || vercelJobs.has(name)) {
    throw new Error(`Batch 11A must remain AWS-only: ${name}`);
  }
  const row = schedules.find((item) => item.name === name);
  if (row?.expression !== expected.get(name)) throw new Error(`Batch 11A cadence drifted: ${name}`);
  const expectedFunction = name === "semantic-nightly"
    ? "node:/api/cron/semantic-nightly"
    : `node:/api/cron/managed?job=${name}`;
  if (row?.function !== expectedFunction) throw new Error(`Batch 11A routing drifted: ${name}`);
}

const batch11bVercelCount = batch11b.filter((name) => vercelJobs.has(name)).length;
if (![0, batch11b.length].includes(batch11bVercelCount)) {
  throw new Error(`Batch 11B Vercel ownership must transition atomically; found ${batch11bVercelCount}/${batch11b.length}`);
}

for (const name of batch11b) {
  if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 11B schedule not active: ${name}`);
  if (rollback.has(name)) throw new Error(`Batch 11B leaked into rollback baseline: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 11B still staged: ${name}`);

  const row = schedules.find((item) => item.name === name);
  if (row?.expression !== expected.get(name)) throw new Error(`Batch 11B cadence drifted: ${name}`);
  if (row?.function !== "sqs:background-cron") throw new Error(`Batch 11B must use durable background queue: ${name}`);
  const expectedTarget = `/api/cron/managed?job=${name}`;
  if (row?.body?.target !== expectedTarget) throw new Error(`Batch 11B durable target drifted: ${name}`);
  const bodyKeys = Object.keys(row?.body ?? {}).sort();
  if (JSON.stringify(bodyKeys) !== JSON.stringify(["target"])) throw new Error(`Batch 11B schedule body must contain target only: ${name}`);
}

for (const name of stagedNames) {
  if (activeNames.has(name)) throw new Error(`active/staged overlap: ${name}`);
}

for (const name of ["crm-sequence-runner", "search-hf-photo-intelligence"]) {
  if (!activeNames.has(name) || !enabled.has(name) || stagedNames.has(name) || vercelJobs.has(name)) {
    throw new Error(`Batch 10 AWS-only ownership regressed: ${name}`);
  }
}

console.log(`batch11_scheduler_contract=pass active=45 rollback=40 staged=19 batch11b_vercel_overlap=${batch11bVercelCount}`);
