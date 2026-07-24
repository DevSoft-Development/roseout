import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const dispatcher = readFileSync("supabase/functions/worker-dispatcher/index.ts", "utf8");
const sharedHandlers = readFileSync("supabase/functions/_shared/workers/jobs.ts", "utf8");
const catalog = readFileSync("lib/workers/catalog.ts", "utf8");

assert.match(dispatcher, /case "photo\.backfill"/);
assert.match(dispatcher, /const functionName = "nightly-photo-backfill"/);
assert.match(dispatcher, /normalizePhotoBackfillPayload/);
assert.match(dispatcher, /copyOptionalString\(payload, normalized, "source", 100\)/);
assert.match(dispatcher, /Unsupported worker job type: \$\{job\.job_type\}/);
assert.match(dispatcher, /await completeJob\(job\.id/);
assert.match(dispatcher, /await failJob\(\{/);
assert.equal((dispatcher.match(/failJob\(\{/g) || []).length, 1);
assert.match(dispatcher, /case "nightly-photo-backfill"/);
assert.match(sharedHandlers, /"photo\.backfill": "nightly-photo-backfill"/);

const readyWorkers = catalog
  .split("\n")
  .map((line) => line.match(/\{ key: "([^"]+)",.*status: "ready" \}/))
  .filter(Boolean)
  .map((match) => match[1]);
const registeredTypes = new Set([
  ...[...sharedHandlers.matchAll(/"([a-z0-9_.-]+)":/g)].map((match) => match[1]),
  ...[...sharedHandlers.matchAll(/"([a-z0-9_.-]+)",/g)].map((match) => match[1]),
]);

for (const worker of readyWorkers) {
  assert.ok(
    registeredTypes.has(worker),
    `Ready worker catalog item ${worker} has no shared handler registration`,
  );
}

console.log("worker dispatcher regression checks passed");
