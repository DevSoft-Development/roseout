import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260813175008_worker_reliability_hardening.sql");
const cronAuthMigration = read(
  "supabase/migrations/20260813175746_repair_giveaway_reminder_cron_auth.sql",
);
const giveawayReminder = read(
  "supabase/functions/admin-giveaway-review-reminder/index.ts",
);
const config = read("supabase/config.toml");
const dispatcher = read("supabase/functions/worker-dispatcher/index.ts");
const sharedJobs = read("supabase/functions/_shared/workers/jobs.ts");
const catalog = read("lib/workers/catalog.ts");
const deployWorkflow = read(".github/workflows/worker-reliability-deploy.yml");
const soakWorkflow = read(".github/workflows/worker-reliability-soak.yml");

assert.match(migration, /revoke all on function %s from public, anon, authenticated/i);
assert.match(migration, /grant execute on function %s to service_role/i);
assert.match(migration, /private\.dispatch_tracked_edge_request/);
assert.match(migration, /private\.reconcile_tracked_edge_requests/);
assert.match(migration, /worker_reliability_soak_report/);
assert.match(migration, /http_status not between 200 and 299/);
assert.match(migration, /response_declares_failure/);
assert.match(migration, /worker-dispatcher-unified/);
assert.match(migration, /where jobname = 'outing-reminders'/);
assert.match(migration, /marks reminders sent without delivering/i);
assert.match(giveawayReminder, /WORKER_INTERNAL_SECRET/);
assert.match(giveawayReminder, /secureCompare/);
assert.match(cronAuthMigration, /x-worker-secret/);
assert.doesNotMatch(cronAuthMigration, /current_setting\('app\./);

for (const retired of [
  "worker-photos",
  "worker-notifications",
  "worker-enrichment",
  "worker-operations",
  "worker-maintenance",
]) {
  assert.match(migration, new RegExp(`'${retired}'`));
}

assert.doesNotMatch(dispatcher, /"notification\.(?:email_deliver|sms_deliver|deliver)": "notification-worker"/);
assert.doesNotMatch(sharedJobs, /"notification\.(?:email_deliver|sms_deliver|deliver)": "notification-worker"/);
assert.doesNotMatch(config, /\[functions\.notification-worker\]/);
assert.match(catalog, /key: "notification\.email_deliver"[\s\S]*?status: "planned"/);
assert.match(catalog, /key: "notification\.sms_deliver"[\s\S]*?status: "planned"/);

for (const match of config.matchAll(/\[functions\.([^\]]+)\]/g)) {
  const functionName = match[1];
  assert.ok(
    existsSync(`supabase/functions/${functionName}/index.ts`),
    `Configured Edge Function ${functionName} has no source directory`,
  );
}

for (const functionName of ["worker-dispatcher", "admin-giveaway-review-reminder"]) {
  assert.match(deployWorkflow, new RegExp(`functions deploy ${functionName}`));
}

assert.match(deployWorkflow, /HTTP 404/);
assert.match(soakWorkflow, /worker_reliability_soak_report/);
assert.match(soakWorkflow, /observed_days/);
assert.match(soakWorkflow, /\.passing/);

console.log("worker reliability regression checks passed");

