import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const file=(path:string)=>readFileSync(path,"utf8");
describe("LI V2 authorized dispatch boundary",()=>{
 const route=file("app/api/internal/li-v2-initial-review/route.ts");
 const worker=file("lib/location-intelligence/v2/initial-review-staging.ts");
 const migration=file("supabase/migrations/20261019160000_li_v2_review_dispatch_discovery.sql");
 it("requires existing private AWS dispatch authentication and a paid-execution flag",()=>{
  expect(route).toContain('request.headers.get("authorization")');
  expect(route).toContain('PLATFORM_RUNTIME_PROVIDER');
  expect(route).toContain('LI_V2_INITIAL_REVIEW_EXECUTION_ENABLED');
  expect(route).toContain('data?.action==="dispatch"');
 });
 it("discovers only previously reserved or submitted tasks, max ten",()=>{
  expect(migration).toContain("t.status in ('reserved','submitted')");
  expect(migration).toContain("least(coalesce(p_limit,10),10)");
  expect(migration).toContain("revoke all");
  expect(migration).toContain("to service_role");
  expect(worker).toContain('task.status==="reserved"');
  expect(worker).toContain("executeReservedInitialReview");
  expect(worker).toContain("collectInitialReviewSample");
 });
 it("guards repeat POST with the atomic ledger claim",()=>{
  expect(worker).toContain('li_v2_begin_initial_review_submission');
  expect(worker).toContain('p_status:"submission_unknown"');
 });
});
