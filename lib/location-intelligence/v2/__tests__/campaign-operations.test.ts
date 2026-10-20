import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");
const queueRunner=readFileSync("lib/location-intelligence/v2/maps-queue-runner.ts","utf8");
const resolver=readFileSync("lib/location-intelligence/v2/maps-independent-resolver.ts","utf8");
const staging=readFileSync("lib/location-intelligence/v2/independent-staging.ts","utf8");
const finalizer=readFileSync("lib/location-intelligence/v2/independent-batch-finalizer.ts","utf8");
const route=readFileSync("app/api/cron/li-v2-acquisition-campaign/route.ts","utf8");
const controls=readFileSync("supabase/migrations/20261015190000_li_v2_import_campaign_runs.sql","utf8");
const schedule=JSON.parse(readFileSync("infra/aws/edge-runtime/schedules.json","utf8")) as Array<{name:string;expression:string;body?:{target:string};enabled?:boolean}>;
const registry=JSON.parse(readFileSync("config/cron-jobs.json","utf8")) as Array<{jobKey:string;targetPath:string;delivery:string}>;

describe("LI V2 campaign operational wiring",()=>{
 it("uses valid function delimiters and fails closed on abandoned paid work",()=>{
  const permission=readFileSync("supabase/migrations/20261015192500_li_v2_worker_permission.sql","utf8");
  const claims=readFileSync("supabase/migrations/20261015191500_li_v2_campaign_worker_claims.sql","utf8");
  expect(permission).toContain("as "+String.fromCharCode(36,36));
  expect(permission).not.toMatch(/as \$(?:\r?\n)/);
  expect(claims).toContain("worker_lease_expired_manual_reconciliation_required");
  expect(claims).not.toContain("status='queued', last_error='worker_lease_expired");
 });
 it("has a managed AWS 15-minute schedule and a protected endpoint",()=>{
  expect(registry).toContainEqual(expect.objectContaining({jobKey:"li-v2-acquisition-campaign",delivery:"managed"}));
  expect(schedule).toContainEqual(expect.objectContaining({name:"li-v2-acquisition-campaign",expression:"cron(0/15 * * * ? *)",enabled:true}));
  expect(route).toContain('PLATFORM_RUNTIME_PROVIDER!=="aws-background"');
  expect(route).toContain('"x-toh-aws-internal"');
  expect(route).toContain('processQueuedAcquisitionCampaign()');
 });
 it("checks operator state and reserves budget before billable Maps submission",()=>{
  expect(worker).toContain('"li_v2_campaign_run_permitted"');
  expect(worker).toContain('submitApprovedMapsQueue(');
  expect(worker).toContain('if(index<run.processed)continue');
  const permitted=queueRunner.indexOf('"li_v2_campaign_run_permitted"');
  const preflight=queueRunner.indexOf('"li_v2_paid_acquisition_preflight"');
  const reserved=queueRunner.indexOf('"reserve_location_acquisition_spend"');
  const submit=queueRunner.indexOf('return submitReservedMapsQueue(');
  expect(permitted).toBeGreaterThan(0);
  expect(preflight).toBeGreaterThan(permitted);
  expect(reserved).toBeGreaterThan(preflight);
  expect(submit).toBeGreaterThan(reserved);
  expect(queueRunner).toContain('if(reserveError||reserved!==true)');
  expect(queueRunner).toContain('"submitting","uncertain"');
 });
 it("stages verified evidence through dedupe and publishability protections",()=>{
  expect(worker).toContain('resolveQueuedMapsToIndependentProfiles(');
  expect(resolver).toContain('stageIndependentCandidate(');
  expect(resolver).toContain('finalizeIndependentBatch(batchId)');
  expect(staging).toContain('source_quality_status:"independently_verified"');
  expect(staging).toContain('import_confidence:"high"');
  expect(staging).toContain('import_status:"staged"');
  expect(staging).toContain('onConflict:"source,source_id"');
  expect(finalizer).toContain('dedupeStagedLocationsChunk(');
  expect(finalizer).toContain('publishReadyStagedLocations(');
  expect(finalizer).toContain('evaluateLocationPublishability(');
 });
 it("records cancellation and prohibits resumed duplicate active runs",()=>{
  expect(controls).toContain("li_v2_one_active_campaign_run");
  expect(controls).toContain("requested_action='cancel'");
  expect(controls).toContain("status='cancelled'");
 });
});
