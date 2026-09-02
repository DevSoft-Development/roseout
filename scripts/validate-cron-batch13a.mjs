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

const activeNames = new Set(schedules.map((row) => row.name));
const stagedNames = new Set(staged.map((row) => row.name));
const enabled = new Set(activation.enabled);
const rollback = new Set(activation.rollback_enabled);
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch < 13) throw new Error(`Batch 13A regression validator cannot run against older batch ${activation.batch}`);
for (const name of batch13a) {
  const row = schedules.find((item) => item.name === name);
  if (!row || !activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 13A AWS ownership regressed: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 13A returned to staging: ${name}`);
  if (vercelJobs.has(name)) throw new Error(`Batch 13A returned to Vercel ownership: ${name}`);
  if (row.expression !== expected.get(name)) throw new Error(`Batch 13A cadence drifted: ${name}`);
  if (row.function !== "sqs:background-cron") throw new Error(`Batch 13A durable queue ownership regressed: ${name}`);
  if (row.body?.target !== `/api/cron/managed?job=${name}`) throw new Error(`Batch 13A durable target drifted: ${name}`);
}

if (!vercelJobs.has("domain-lifecycle")) throw new Error("domain-lifecycle must remain Vercel-owned until its dedicated handoff completes");
if (activeNames.has("domain-lifecycle") || stagedNames.has("domain-lifecycle")) throw new Error("domain-lifecycle leaked into shared scheduler inventory");

for (const required of ["dryRunRequested", "suppressConfiguredEmail: dryRun", "side_effects: false", "if (dryRun)"]) {
  if (!managedRoute.includes(required)) throw new Error(`managed dry-run safety contract missing: ${required}`);
}
for (const required of ["claimExecutionLease", "duplicate_inflight", "last_started_at", "suppressConfiguredEmail"]) {
  if (!trackedCron.includes(required)) throw new Error(`managed execution lease contract missing: ${required}`);
}

if (activation.batch === 13) {
  const activeSorted = [...activeNames].sort();
  const enabledSorted = [...enabled].sort();
  const rollbackExpected = activeSorted.filter((name) => !batch13a.includes(name)).sort();
  const rollbackSorted = [...rollback].sort();
  const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
  const dryRunProbes = [...(activation.dry_run_probe ?? [])].sort();
  const deferred = ["microsoft-365-sync", "marketing-social-publish", "website-failover"].sort();

  if (schedules.length !== 61 || activation.enabled.length !== 61) throw new Error("Batch 13A current inventory must contain 61 schedules");
  if (activation.rollback_enabled.length !== 55) throw new Error("Batch 13A rollback baseline must contain 55 schedules");
  if (staged.length !== 3) throw new Error("Batch 13A must retain exactly three staged high-risk schedules");
  if (activation.probe.length !== 0) throw new Error("Batch 13A must not use live side-effect probes");
  if (JSON.stringify(dryRunProbes) !== JSON.stringify(batch13a)) throw new Error(`unexpected Batch 13A dry-run probes: ${dryRunProbes.join(",")}`);
  if (JSON.stringify(activeSorted) !== JSON.stringify(enabledSorted)) throw new Error("Batch 13A enabled inventory must equal schedule inventory");
  if (JSON.stringify(delta) !== JSON.stringify(batch13a)) throw new Error(`unexpected Batch 13A delta: ${delta.join(",")}`);
  if (JSON.stringify(rollbackSorted) !== JSON.stringify(rollbackExpected)) throw new Error("Batch 13A rollback baseline is not exact");
  for (const name of deferred) {
    if (!stagedNames.has(name) || activeNames.has(name)) throw new Error(`Batch 13A staged ownership regressed: ${name}`);
  }
}

console.log(`batch13a_ownership_regression=pass current_batch=${activation.batch} active=6 vercel=0`);
