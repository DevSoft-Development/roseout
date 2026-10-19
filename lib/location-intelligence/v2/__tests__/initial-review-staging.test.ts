import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
const file=(path:string)=>readFileSync(path,"utf8");
describe("LI V2 initial review no-repeat acquisition",()=>{
 const sql=file("supabase/migrations/20261019090000_li_v2_initial_review_task_ledger.sql");
 const worker=file("lib/location-intelligence/v2/initial-review-staging.ts");
 const publisher=file("lib/location-growth/publishReady.ts");
 it("enforces unique business intent and unique metering key before POST",()=>{
  expect(sql).toContain("business_key text not null unique");
  expect(sql).toContain("spend_event_key text not null unique");
  expect(sql).toContain("reserve_location_acquisition_spend");
  expect(worker.indexOf("li_v2_begin_initial_review_submission"))
    .toBeLessThan(worker.indexOf("createDataForSeoReviewTask({"));
 });
 it("does not retry unknown paid submissions automatically",()=>{
  expect(sql).toContain("'submission_unknown'");
  expect(sql).toContain("where id=p_id and status='reserved'");
  expect(worker).toContain('status:"submission_unknown"');
  expect(worker).toContain("if(!claim.created)return");
 });
 it("retains a hard publication gate and bounded result sample",()=>{
  expect(publisher).toContain("acceptance.oneTouchComplete !== true");
  expect(publisher).toContain("li_v2_initial_review_sample");
  expect(worker).toContain("if(items.length>=100)break");
  expect(worker).toContain("provider_completed_with_no_reviews");
 });
});
