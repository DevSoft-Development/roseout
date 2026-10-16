import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");
const certifier=readFileSync("lib/location-intelligence/v2/consumer-retrieval-certifier.ts","utf8");
const sql=readFileSync("supabase/migrations/20261016180000_li_v2_consumer_retrieval_checks.sql","utf8");
const queue=readFileSync("lib/location-intelligence/v2/maps-queue-runner.ts","utf8");

describe("LI V2 unattended consumer retrieval safeguards",()=>{
 it("checks exact TOH IDs without claiming protected Search V3 provenance",()=>{
  expect(certifier).toContain("https://theouthaven.com/api/explore/search");
  expect(certifier).toContain("row.location_id");
  expect(certifier).toContain('cache:"no-store"');
  expect(worker).toContain("authenticatedSearchV3Certified:false");
 });
 it("uses a durable, service-role-only retry ledger with finite quarantine",()=>{
  expect(sql).toContain("private.li_v2_consumer_retrieval_checks");
  expect(sql).toContain("auth.role() is distinct from 'service_role'");
  expect(sql).toContain("attempts+1>=8");
  expect(sql).toContain("next_attempt_at");
  expect(certifier).toContain("x.due");
  expect(certifier).toContain("no_authorized_locations_registered");
 });
 it("does not resubmit a paid task while awaiting indexing",()=>{
  expect(worker.indexOf('advanceMapsQueue(run.id,index,query)')).toBeLessThan(worker.indexOf('submitApprovedMapsQueue({'));
  expect(worker).toContain("advanceConsumerChecks(run.id,index)");
  expect(worker).toContain("await yieldQueuedRun(run.id)");
  expect(worker).toContain('if(queue.status==="reviewed")');
  expect(queue).toContain('if(row?.status==="reviewed"||row?.status==="failed")');
 });
 it("preserves paid acquisition reservation and operator checks",()=>{
  expect(queue).toContain('"li_v2_paid_acquisition_preflight"');
  expect(queue).toContain('"reserve_location_acquisition_spend"');
  expect(worker).toContain('"li_v2_campaign_run_permitted"');
  expect(sql).toContain("p_from");
 });
});
