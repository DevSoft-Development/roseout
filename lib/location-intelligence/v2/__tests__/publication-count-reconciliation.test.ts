import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");
const migration=readFileSync("supabase/migrations/20261018222500_li_v2_reconcile_published_counts.sql","utf8");
describe("LI V2 published counter reconciliation",()=>{
 it("counts distinct actual published LI V2 locations rather than processed targets",()=>{
  expect(migration).toContain("count(distinct c.location_id)");
  expect(migration).toContain("l.import_source='li_v2_independent'");
  expect(migration).toContain("l.has_photos=true");
  expect(migration).toContain("l.publish_ready=true");
  expect(migration).toContain("greatest(published,n)");
 });
 it("reconciles after existing and freshly reviewed targets without changing paid queues",()=>{
  expect(worker).toContain('rpc("li_v2_reconcile_campaign_published"');
  expect(worker).toContain('if(queue.status==="reviewed")');
  expect(worker).toContain('p_from:"ready",p_to:"reviewed"');
  expect(worker.match(/await reconcilePublished\(run.id\)/g)?.length).toBe(2);
 });
});