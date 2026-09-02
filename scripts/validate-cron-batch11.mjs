import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");

const batch11 = [
  "backfill-review-counts",
  "semantic-nightly",
  "search-ml-training-dataset",
  "search-anchor-reconciliation",
  "search-anchor-history-cleanup",
  "health-intelligence",
  "nightly-search-profile-queue",
  "ml-recalculate-phase2",
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
  ["health-intelligence", "cron(15 7 * * ? *)"],
  ["nightly-search-profile-queue", "cron(45 7 * * ? *)"],
  ["ml-recalculate-phase2", "cron(30 8 * * ? *)"],
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
if (activation.rollback_enabled.length !== 34) throw new Error(`expected rollback baseline 34, got ${activation.rollback_enabled.length}`);
if (staged.length !== 19) throw new Error(`expected 19 staged schedules, got ${staged.length}`);
if (JSON.stringify(delta) !== JSON.stringify(batch11)) throw new Error(`unexpected Batch 11 delta: ${delta.join(",")}`);
if (JSON.stringify(probes) !== JSON.stringify(batch11)) throw new Error(`unexpected Batch 11 probes: ${probes.join(",")}`);

for (const name of batch11) {
  if (!activeNames.has(name)) throw new Error(`Batch 11 schedule missing from active inventory: ${name}`);
  if (!enabled.has(name)) throw new Error(`Batch 11 schedule is not enabled: ${name}`);
  if (rollback.has(name)) throw new Error(`Batch 11 schedule leaked into rollback baseline: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 11 schedule still staged: ${name}`);
  if (!vercelJobs.has(name)) throw new Error(`Batch 11 replacement must keep Vercel ownership until AWS activation is proven: ${name}`);

  const row = schedules.find((item) => item.name === name);
  if (row?.expression !== expected.get(name)) throw new Error(`Batch 11 cadence drifted: ${name}`);
  if (row?.function !== `node:/api/cron/managed?job=${name}`) throw new Error(`Batch 11 must use private Node managed routing: ${name}`);
  if (Object.keys(row?.body ?? {}).length !== 0) throw new Error(`Batch 11 body must remain empty: ${name}`);
}

for (const name of stagedNames) {
  if (activeNames.has(name)) throw new Error(`active/staged overlap: ${name}`);
}

for (const name of ["crm-sequence-runner", "search-hf-photo-intelligence"]) {
  if (!activeNames.has(name) || !enabled.has(name) || stagedNames.has(name) || vercelJobs.has(name)) {
    throw new Error(`Batch 10 AWS-only ownership regressed: ${name}`);
  }
}

const forbidden = [
  "microsoft-365-sync",
  "marketing-social-publish",
  "domain-lifecycle",
  "website-failover",
  "website-dr-readiness",
  "event-provider-ingestion",
  "beta-reminders",
  "post-visit-followups",
  "profile-completion-nurture",
];
for (const name of forbidden) {
  if (batch11.includes(name)) throw new Error(`risky workload entered Batch 11: ${name}`);
}

console.log("batch11_scheduler_contract=pass active=45 rollback=34 staged=19 vercel_overlap=11");
