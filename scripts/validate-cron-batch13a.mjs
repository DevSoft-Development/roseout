import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const readText = (path) => fs.readFileSync(path, "utf8");

const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");
const managedRoute = readText("app/api/cron/managed/route.ts");
const trackedCron = readText("lib/cron/runTrackedCron.ts");

const batch13a = [
  "daily-admin-digest",
  "search-quality-digest",
  "beta-reminders",
  "post-visit-followups",
  "profile-completion-nurture",
  "postcard-followups",
].sort();

const expected = new Map([
  ["daily-admin-digest", "cron(30 7 * * ? *)"],
  ["search-quality-digest", "cron(30 12 * * ? *)"],
  ["beta-reminders", "cron(0 14 ? * MON-FRI *)"],
  ["post-visit-followups", "cron(5 * * * ? *)"],
  ["profile-completion-nurture", "cron(5 * * * ? *)"],
  ["postcard-followups", "cron(45 13 * * ? *)"],
]);

const deferred = ["microsoft-365-sync", "marketing-social-publish", "website-failover"].sort();
const activeNames = new Set(schedules.map((row) => row.name));
const stagedNames = new Set(staged.map((row) => row.name));
const enabled = new Set(activation.enabled);
const rollback = new Set(activation.rollback_enabled);
const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
const activeSorted = [...activeNames].sort();
const enabledSorted = [...enabled].sort();
const rollbackExpected = activeSorted.filter((name) => !batch13a.includes(name)).sort();
const rollbackSorted = [...rollback].sort();
const dryRunProbes = [...(activation.dry_run_probe ?? [])].sort();
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch > 13) {
  for (const name of batch13a) {
    if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 13A AWS ownership regressed: ${name}`);
    if (stagedNames.has(name)) throw new Error(`Batch 13A returned to staged inventory: ${name}`);
    if (vercelJobs.has(name)) throw new Error(`Batch 13A returned to Vercel ownership: ${name}`);
    const row = schedules.find((item) => item.name === name);
    if (row?.expression !== expected.get(name)) throw new Error(`Batch 13A cadence drifted: ${name}`);
    if (row?.function !== "sqs:background-cron") throw new Error(`Batch 13A durable path regressed: ${name}`);
    if (row?.body?.target !== `/api/cron/managed?job=${name}`) throw new Error(`Batch 13A durable target drifted: ${name}`);
  }
  console.log(`batch13a_scheduler_contract=preserved current_batch=${activation.batch} jobs=6`);
  process.exit(0);
}

if (activation.batch !== 13) throw new Error(`expected Batch 13, got ${activation.batch}`);
if (schedules.length !== 61) throw new Error(`expected 61 active schedules, got ${schedules.length}`);
if (activation.enabled.length !== 61) throw new Error(`expected 61 enabled schedules, got ${activation.enabled.length}`);
if (activation.rollback_enabled.length !== 55) throw new Error(`expected rollback baseline 55, got ${activation.rollback_enabled.length}`);
if (staged.length !== 3) throw new Error(`expected 3 staged schedules, got ${staged.length}`);
if (activation.probe.length !== 0) throw new Error("Batch 13A must not invoke real side-effect probes during scheduler activation");
if (JSON.stringify(dryRunProbes) !== JSON.stringify(batch13a)) throw new Error(`unexpected Batch 13A dry-run probes: ${dryRunProbes.join(",")}`);
if (JSON.stringify(activeSorted) !== JSON.stringify(enabledSorted)) throw new Error("enabled inventory must exactly equal active schedule inventory");
if (JSON.stringify(delta) !== JSON.stringify(batch13a)) throw new Error(`unexpected Batch 13A delta: ${delta.join(",")}`);
if (JSON.stringify(rollbackSorted) !== JSON.stringify(rollbackExpected)) throw new Error("Batch 13A rollback baseline is not the exact previous 55-schedule fleet");

for (const name of batch13a) {
  if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 13A schedule not active: ${name}`);
  if (rollback.has(name)) throw new Error(`Batch 13A leaked into rollback baseline: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 13A still staged: ${name}`);
  const row = schedules.find((item) => item.name === name);
  if (row?.expression !== expected.get(name)) throw new Error(`Batch 13A cadence drifted: ${name}`);
  if (row?.function !== "sqs:background-cron") throw new Error(`Batch 13A must use durable background queue: ${name}`);
  if (row?.body?.target !== `/api/cron/managed?job=${name}`) throw new Error(`Batch 13A durable target drifted: ${name}`);
  if (JSON.stringify(Object.keys(row?.body ?? {}).sort()) !== JSON.stringify(["target"])) {
    throw new Error(`Batch 13A schedule body must contain target only: ${name}`);
  }
}

for (const name of deferred) {
  if (!stagedNames.has(name)) throw new Error(`high-risk job must remain staged after Batch 13A: ${name}`);
  if (activeNames.has(name) || enabled.has(name)) throw new Error(`high-risk job became active during Batch 13A: ${name}`);
}
for (const name of stagedNames) {
  if (activeNames.has(name)) throw new Error(`active/staged overlap: ${name}`);
}

if (activeNames.has("domain-lifecycle") || enabled.has("domain-lifecycle") || stagedNames.has("domain-lifecycle")) {
  throw new Error("domain-lifecycle must remain on its dedicated worker migration path");
}
if (!vercelJobs.has("domain-lifecycle")) throw new Error("domain-lifecycle must remain Vercel-owned during Batch 13A");

const overlap = batch13a.filter((name) => vercelJobs.has(name)).length;
if (![0, batch13a.length].includes(overlap)) {
  throw new Error(`Batch 13A Vercel ownership must transition atomically; found ${overlap}/${batch13a.length}`);
}

const expectedVercel = new Set([
  "microsoft-365-sync",
  "marketing-social-publish",
  "domain-lifecycle",
  "website-failover",
  ...(overlap ? batch13a : []),
]);
if (vercelJobs.size !== expectedVercel.size) throw new Error(`unexpected Vercel cron count ${vercelJobs.size}; expected ${expectedVercel.size}`);
for (const name of expectedVercel) {
  if (!vercelJobs.has(name)) throw new Error(`expected Vercel cron missing: ${name}`);
}
for (const name of vercelJobs) {
  if (!expectedVercel.has(name)) throw new Error(`unexpected Vercel cron during Batch 13A: ${name}`);
}

for (const required of ["dryRunRequested", "suppressConfiguredEmail: dryRun", "side_effects: false", "if (dryRun)"]) {
  if (!managedRoute.includes(required)) throw new Error(`managed dry-run safety contract missing: ${required}`);
}
for (const required of ["claimExecutionLease", "duplicate_inflight", "last_started_at", "suppressConfiguredEmail"]) {
  if (!trackedCron.includes(required)) throw new Error(`managed execution lease contract missing: ${required}`);
}

console.log(`batch13a_scheduler_contract=pass active=61 rollback=55 staged=3 vercel_overlap=${overlap} probes=0 dry_run_probes=6`);
