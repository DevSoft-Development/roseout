import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
const file=(path:string)=>readFileSync(path,"utf8");
describe("LI V2 initial review no-repeat acquisition",()=>{
 const sql=file("supabase/migrations/20261019090000_li_v2_initial_review_task_ledger.sql");
 const worker=file("lib/location-intelligence/v2/initial-review-staging.ts");
 const publisher=file("lib/location-growth/publishReady.ts");
 const privateRoute=file("app/api/internal/li-v2-initial-review/route.ts");
 const admin=file("apps/admin/app/admin/dashboard/settings/location-tools/campaigns/page.tsx");
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
 it("reserves budget with a unique business key and never bills from the Admin action",()=>{
  expect(admin).toContain('p_business_key:"google:"+googlePlaceId');
  expect(admin).toContain('li_v2_claim_initial_review_task');
  expect(admin).not.toContain("createDataForSeoReviewTask");
  expect(sql).toContain("pg_advisory_xact_lock(6742031)");
  expect(sql).toContain("if not permitted then");
  expect(sql).toContain("'budget_denied'");
 });
 it("never re-POSTs a previously claimed or ambiguous task",()=>{
  expect(worker).toContain("if(!claim.created)return");
  expect(worker).toContain('p_expected_status:"submitting",p_status:"submission_unknown"');
  expect(worker).toContain('task.status!=="submission_unknown"');
  expect(worker).toContain("getDataForSeoReviewTask(input.providerTaskId)");
  expect(sql).toContain("p_expected_status='submission_unknown' and p_status='submitted'");
 });
 it("requires opt-in private AWS dispatch for provider execution",()=>{
  expect(privateRoute).toContain('LI_V2_INITIAL_REVIEW_EXECUTION_ENABLED');
  expect(privateRoute).toContain('PLATFORM_RUNTIME_PROVIDER');
  expect(privateRoute).toContain('x-toh-aws-internal');
  expect(privateRoute).toContain('executeReservedInitialReview');
  expect(privateRoute).toContain('collectInitialReviewSample');
 });
 it("reuses approved ledger and quarantines ambiguous provider responses",()=>{
  expect(worker).toContain('task.status!=="reserved"');
  expect(worker).toContain('task.business_key!=="google:"+placeId');
  expect(worker).toContain('li_v2_begin_initial_review_submission');
  expect(worker).toContain('p_status:"submission_unknown"');
  expect(worker).toContain('tag:`toh:initial:${input.ledgerId}`');
 });
 it("allows submission only once from reserved state",()=>{
  expect(sql).toContain("where id=p_id and status='reserved'");
  expect(sql).toContain("get diagnostics changed=row_count");
  expect(sql).toContain("return changed=1");
 });
});
