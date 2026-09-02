import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const readText = (path) => fs.readFileSync(path, "utf8");

const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");
const managedRoute = readText("app/api/cron/managed/route.ts");
const microsoftSync = readText("lib/microsoft-365/sync-with-crm.ts");
const socialClaims = readText("lib/marketing/social-publish-claims.ts");
const websiteLease = readText("lib/hosting/website-mutation-lease.ts");
const microsoftLeaseMigration = readText("supabase/migrations/20260902112500_add_microsoft_365_sync_lease.sql");
const websiteLeaseMigration = readText("supabase/migrations/20260902112600_add_website_failover_lease.sql");

const batch14 = [
  "microsoft-365-sync",
  "marketing-social-publish",
  "website-failover",
].sort();

const expectedCadence = new Map(batch14.map((name) => [name, "cron(0/5 * * * ? *)"]));
const activeNames = new Set(schedules.map((row) => row.name));
const stagedNames = new Set(staged.map((row) => row.name));
const enabled = new Set(activation.enabled ?? []);
const rollback = new Set(activation.rollback_enabled ?? []);
const activeSorted = [...activeNames].sort();
const enabledSorted = [...enabled].sort();
const rollbackSorted = [...rollback].sort();
const rollbackExpected = activeSorted.filter((name) => !batch14.includes(name)).sort();
const delta = (activation.enabled ?? []).filter((name) => !rollback.has(name)).sort();
const dryRunProbes = [...(activation.dry_run_probe ?? [])].sort();
const vercelJobs = new Set(
  (vercel.crons ?? [])
    .map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job"))
    .filter(Boolean),
);

if (activation.batch > 14) {
  for (const name of batch14) {
    if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 14 AWS ownership regressed: ${name}`);
    if (stagedNames.has(name)) throw new Error(`Batch 14 returned to staged inventory: ${name}`);
    if (vercelJobs.has(name)) throw new Error(`Batch 14 returned to Vercel ownership: ${name}`);
    const row = schedules.find((item) => item.name === name);
    if (row?.expression !== expectedCadence.get(name)) throw new Error(`Batch 14 cadence drifted: ${name}`);
    if (row?.function !== "sqs:background-cron") throw new Error(`Batch 14 durable path regressed: ${name}`);
    if (row?.body?.target !== `/api/cron/managed?job=${name}`) throw new Error(`Batch 14 durable target drifted: ${name}`);
  }
  console.log(`batch14_scheduler_contract=preserved current_batch=${activation.batch} jobs=3`);
  process.exit(0);
}

if (activation.batch !== 14) throw new Error(`expected Batch 14, got ${activation.batch}`);
if (schedules.length !== 64) throw new Error(`expected 64 active schedules, got ${schedules.length}`);
if ((activation.enabled ?? []).length !== 64) throw new Error(`expected 64 enabled schedules, got ${(activation.enabled ?? []).length}`);
if ((activation.rollback_enabled ?? []).length !== 61) throw new Error(`expected rollback baseline 61, got ${(activation.rollback_enabled ?? []).length}`);
if (staged.length !== 0) throw new Error(`expected no staged schedules after Batch 14 promotion, got ${staged.length}`);
if ((activation.probe ?? []).length !== 0) throw new Error("Batch 14 must not invoke real side-effect probes during scheduler activation");
if (JSON.stringify(dryRunProbes) !== JSON.stringify(batch14)) throw new Error(`unexpected Batch 14 dry-run probes: ${dryRunProbes.join(",")}`);
if (JSON.stringify(activeSorted) !== JSON.stringify(enabledSorted)) throw new Error("enabled inventory must exactly equal active schedule inventory");
if (JSON.stringify(delta) !== JSON.stringify(batch14)) throw new Error(`unexpected Batch 14 activation delta: ${delta.join(",")}`);
if (JSON.stringify(rollbackSorted) !== JSON.stringify(rollbackExpected)) throw new Error("Batch 14 rollback baseline is not the exact previous 61-schedule fleet");

for (const name of batch14) {
  if (!activeNames.has(name) || !enabled.has(name)) throw new Error(`Batch 14 schedule not active in manifest: ${name}`);
  if (rollback.has(name)) throw new Error(`Batch 14 leaked into rollback baseline: ${name}`);
  if (stagedNames.has(name)) throw new Error(`Batch 14 job remained staged: ${name}`);
  const row = schedules.find((item) => item.name === name);
  if (row?.expression !== expectedCadence.get(name)) throw new Error(`Batch 14 cadence drifted: ${name}`);
  if (row?.function !== "sqs:background-cron") throw new Error(`Batch 14 must use durable background queue: ${name}`);
  if (row?.body?.target !== `/api/cron/managed?job=${name}`) throw new Error(`Batch 14 durable target drifted: ${name}`);
  if (JSON.stringify(Object.keys(row?.body ?? {}).sort()) !== JSON.stringify(["target"])) {
    throw new Error(`Batch 14 schedule body must contain target only: ${name}`);
  }
}

if (activeNames.has("domain-lifecycle") || enabled.has("domain-lifecycle") || stagedNames.has("domain-lifecycle")) {
  throw new Error("domain-lifecycle must remain isolated on its dedicated AWS worker migration path");
}
if (!vercelJobs.has("domain-lifecycle")) throw new Error("domain-lifecycle must remain Vercel-owned during Batch 14");

const overlap = batch14.filter((name) => vercelJobs.has(name)).length;
if (![0, batch14.length].includes(overlap)) {
  throw new Error(`Batch 14 Vercel ownership must transition atomically; found ${overlap}/${batch14.length}`);
}
const expectedVercel = new Set(["domain-lifecycle", ...(overlap ? batch14 : [])]);
if (vercelJobs.size !== expectedVercel.size) throw new Error(`unexpected Vercel cron count ${vercelJobs.size}; expected ${expectedVercel.size}`);
for (const name of expectedVercel) if (!vercelJobs.has(name)) throw new Error(`expected Vercel cron missing: ${name}`);
for (const name of vercelJobs) if (!expectedVercel.has(name)) throw new Error(`unexpected Vercel cron during Batch 14: ${name}`);

for (const required of ["dryRunRequested", "suppressConfiguredEmail: dryRun", "side_effects: false", "if (dryRun)"]) {
  if (!managedRoute.includes(required)) throw new Error(`managed dry-run safety contract missing: ${required}`);
}
for (const required of ["MICROSOFT_SYNC_LEASE_MS", "sync_lease_token", "sync_lease_expires_at", "sync_inflight", '.eq("sync_lease_token", token)']) {
  if (!microsoftSync.includes(required)) throw new Error(`Microsoft distributed sync lease contract missing: ${required}`);
}
for (const required of ['.in("status", ["queued", "retrying"])', 'status: "publishing"', '.eq("status", job.status)', 'reason: "claimed_elsewhere"']) {
  if (!socialClaims.includes(required)) throw new Error(`social publish claim contract missing: ${required}`);
}
for (const required of ["WEBSITE_MUTATION_LEASE_MS", "failover_lease_token", "failover_lease_expires_at", '.eq("failover_lease_token", token)']) {
  if (!websiteLease.includes(required)) throw new Error(`website failover lease contract missing: ${required}`);
}
for (const required of ["sync_lease_token", "sync_lease_expires_at"]) {
  if (!microsoftLeaseMigration.includes(required)) throw new Error(`Microsoft lease migration contract missing: ${required}`);
}
for (const required of ["failover_lease_token", "failover_lease_expires_at"]) {
  if (!websiteLeaseMigration.includes(required)) throw new Error(`website lease migration contract missing: ${required}`);
}

console.log(`batch14_scheduler_contract=pass active=64 rollback=61 staged=0 vercel_overlap=${overlap} probes=0 dry_run_probes=3`);
