import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

test("batch 9 is AWS-owned with lower-frequency recovery schedules", () => {
  const schedules = readJson("infra/aws/edge-runtime/schedules.json");
  const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
  const activation = readJson("infra/aws/edge-runtime/activation.json");
  const vercel = readJson("vercel.json");
  const batch = new Set([
    "search-phase13-maintenance",
    "search-hf-inventory-maintenance",
    "website-replica-repair",
    "cron-alert-dispatcher",
  ]);

  const active = new Map(schedules.map((row) => [row.name, row]));
  const stagedNames = new Set(staged.map((row) => row.name));
  const vercelJobs = new Set((vercel.crons ?? []).map((row) => new URL(`https://local${row.path}`).searchParams.get("job")));

  assert.equal(activation.batch, 9);
  assert.equal(schedules.length, 32);
  assert.equal(staged.length, 32);
  assert.equal(activation.enabled.length, 32);
  assert.equal(activation.rollback_enabled.length, 28);
  for (const name of batch) {
    assert.ok(active.has(name));
    assert.ok(activation.enabled.includes(name));
    assert.ok(activation.probe.includes(name));
    assert.equal(stagedNames.has(name), false);
    assert.equal(vercelJobs.has(name), false);
  }
  assert.equal(active.get("search-phase13-maintenance")?.expression, "cron(5 * * * ? *)");
  assert.equal(active.get("search-hf-inventory-maintenance")?.expression, "cron(20 * * * ? *)");
  assert.equal(active.get("website-replica-repair")?.expression, "cron(0/15 * * * ? *)");
  assert.equal(active.get("cron-alert-dispatcher")?.expression, "cron(0/10 * * * ? *)");
  assert.equal(active.get("worker-dispatcher-unified")?.expression, "cron(0/5 * * * ? *)");
});

test("durable worker enqueue has an immediate AWS kick and a guarded fallback", () => {
  const source = read("lib/workers/enqueue.ts");
  assert.match(source, /AWS_EVENT_DISPATCH_JOB_TYPES/);
  assert.match(source, /invokePlatformBackground\("worker-dispatcher"/);
  assert.match(source, /worker_jobs row is already persisted/);
});

test("website replication failure requests immediate repair", () => {
  const source = read("lib/hosting/website-replication.ts");
  assert.match(source, /website-replica-repair/);
  assert.match(source, /website_replication_failed/);
  assert.match(source, /15-minute EventBridge reconciliation/);
});
