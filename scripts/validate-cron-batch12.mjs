import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");

const batch12 = [
  "curated-location-discovery-restaurant",
  "curated-location-discovery-activity",
  "event-provider-ingestion",
  "crm-commercial",
  "marketing-reminders",
  "marketing-content-opportunities",
  "marketing-social-metrics",
  "marketing-attribution",
  "website-dr-readiness",
  "stripe-connect-status-sync",
].sort();

const expected = new Map([
  ["curated-location-discovery-restaurant", "cron(30 6 * * ? *)"],
  ["curated-location-discovery-activity", "cron(0 7 * * ? *)"],
  ["event-provider-ingestion", "cron(20 10 * * ? *)"],
  ["crm-commercial", "cron(20 5 * * ? *)"],
  ["marketing-reminders", "cron(15 12 * * ? *)"],
  ["marketing-content-opportunities", "cron(30 * * * ? *)"],
  ["marketing-social-metrics", "cron(10 0/6 * * ? *)"],
  ["marketing-attribution", "cron(25 * * * ? *)"],
  ["website-dr-readiness", "cron(15 * * * ? *)"],
  ["stripe-connect-status-sync", "cron(45 * * * ? *)"],
]);

const deferred = [
  "daily-admin-digest",
  "search-quality-digest",
  "beta-reminders",
  "post-visit-followups",
  "profile-completion-nurture",
  "microsoft-365-sync",
  "marketing-social-publish",
  "postcard-followups",
  "website-failover",
].sort();

const activeNames = new Set(schedules.map((row) => row.name));
const stagedNames = new Set(staged.map((row) => row.name));
const rollback = new Set(activation.rollback_enabled);
const enabled = new Set(activation.enabled);
const probes = [...activation.probe].sort();
const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch !== 12) throw new Error(`expected Batch 12, got ${activation.batch}`);
if (schedules.length !== 55) throw new Error(`expected 55 active schedules, got ${schedules.length}`);
if (activation.enabled.length !== 55) throw new Error(`expected 55 enabled schedules, got ${activation.enabled.length}`);
if (activation.rollback_enabled.length !== 45) throw new Error(`expected rollback baseline 45, got ${activation.rollback_enabled.length}`);
if (staged.length !== 9) throw new Error(`expected 9 staged schedules, got ${staged.length}`);
if (JSON.stringify(delta) !== JSON.stringify(batch12)) throw new Error(`unexpected Batch 12 delta: ${delta.join(",")}`);
if (JSON.stringify(probes) !== JSON.stringify(batch12)) throw new Error(`unexpected Batch 12 probes: ${probes.join(",")}`);

const batch12VercelCount = batch12.filter((name) => vercelJobs.has(name)).length;
if (![0, batch12.length].includes(batch12VercelCount)) {
  throw new Error(`Batch 12 Vercel ownership must transition atomically; found ${batch12VercelCount}/${batch12.length}`);
}

for (const name of batch12) {
  if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 12 schedule not active: ${name}`);
  if (rollback.has(name)) throw new Error(`Batch 12 leaked into rollback baseline: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 12 still staged: ${name}`);
  const row = schedules.find((item) => item.name === name);
  if (row?.expression !== expected.get(name)) throw new Error(`Batch 12 cadence drifted: ${name}`);
  if (row?.function !== "sqs:background-cron") throw new Error(`Batch 12 must use durable background queue: ${name}`);
  if (row?.body?.target !== `/api/cron/managed?job=${name}`) throw new Error(`Batch 12 durable target drifted: ${name}`);
  const bodyKeys = Object.keys(row?.body ?? {}).sort();
  if (JSON.stringify(bodyKeys) !== JSON.stringify(["target"])) throw new Error(`Batch 12 schedule body must contain target only: ${name}`);
}

for (const name of deferred) {
  if (!stagedNames.has(name)) throw new Error(`Deferred high-risk job must remain staged after Batch 12: ${name}`);
  if (activeNames.has(name) || enabled.has(name)) throw new Error(`Deferred high-risk job became active too early: ${name}`);
}

if (activeNames.has("domain-lifecycle") || enabled.has("domain-lifecycle") || stagedNames.has("domain-lifecycle")) {
  throw new Error("domain-lifecycle must stay on its dedicated worker migration path");
}
if (!vercelJobs.has("domain-lifecycle")) {
  throw new Error("domain-lifecycle must remain Vercel-owned until its dedicated AWS worker is proven");
}

for (const name of rollback) {
  if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 12 rollback baseline is not active: ${name}`);
}
for (const name of stagedNames) {
  if (activeNames.has(name)) throw new Error(`active/staged overlap: ${name}`);
}

console.log(`batch12_scheduler_contract=pass active=55 rollback=45 staged=9 vercel_overlap=${batch12VercelCount}`);
