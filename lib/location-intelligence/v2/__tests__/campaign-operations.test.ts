import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");
const route=readFileSync("app/api/cron/li-v2-acquisition-campaign/route.ts","utf8");
const controls=readFileSync("supabase/migrations/20261015190000_li_v2_import_campaign_runs.sql","utf8");
const schedule=JSON.parse(readFileSync("infra/aws/edge-runtime/schedules.json","utf8")) as Array<{name:string;expression:string;body?:{target:string};enabled?:boolean}>;
const registry=JSON.parse(readFileSync("config/cron-jobs.json","utf8")) as Array<{jobKey:string;targetPath:string;delivery:string}>;

describe("LI V2 campaign operational wiring",()=>{
 it("uses valid function delimiters and fails closed on abandoned paid work",()=>{
  const permission=readFileSync("supabase/migrations/20261015192500_li_v2_worker_permission.sql","utf8");
  const claims=readFileSync("supabase/migrations/20261015191500_li_v2_campaign_worker_claims.sql","utf8");
  expect(permission).toContain("as "+String.fromCharCode(36,36));
  expect(permission).not.toMatch(/as \\$(?:\\r?\\n)/);
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
 it("checks budget and operator state before each paid request and before publication",()=>{
  const check=worker.indexOf('rpc("li_v2_campaign_run_permitted"');
  const paid=worker.indexOf("await provider.execute");
  const final=worker.indexOf('const publishing=await publishReadyStagedLocations');
  expect(check).toBeGreaterThan(0);
  expect(check).toBeLessThan(paid);
  expect(worker.lastIndexOf('li_v2_campaign_run_permitted',final)).toBeGreaterThan(paid);
  expect(worker).toContain('if (index < run.processed) continue');
 });
 it("stages unverified evidence and applies existing dedupe and publishability protections",()=>{
  expect(worker).toContain('source_quality_status:"imported_unverified"');
  expect(worker).toContain('import_confidence:"low"');
  expect(worker).toContain("dedupeStagedLocationsChunk");
  expect(worker).toContain("publishReadyStagedLocations");
  expect(worker).not.toContain('quality_status:"publish_ready"');
 });
 it("records cancellation and prohibits resumed duplicate active runs",()=>{
  expect(controls).toContain("li_v2_one_active_campaign_run");
  expect(controls).toContain("requested_action='cancel'");
  expect(controls).toContain("status='cancelled'");
 });
});
